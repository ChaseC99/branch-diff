import {
    Event,
    EventEmitter,
    ProviderResult,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Uri,
} from 'vscode';

import * as cp from "child_process";

/**
 * A helper function to run shell commands
 * @param cmd the command to execute
 * @returns the output of the shell command
 */
const execShell = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
        cp.exec(cmd, (err, out) => {
            if (err) {
                return reject(err);
            }
            return resolve(out);
        });
    });

export class BranchDiffProvider implements TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: EventEmitter<FileItem | undefined | void> = new EventEmitter<FileItem | undefined | void>();
	readonly onDidChangeTreeData: Event<FileItem | undefined | void> = this._onDidChangeTreeData.event;

    tree: {[key: string]: any };
    parentBranch: string;
    constructor(private workspaceRoot: string | undefined) {
        this.tree = {}

        this.parentBranch = ""
        this.getParentBranch().then(result => {
            this.parentBranch = result
            this.refresh()
        })
    }

    getTreeItem(element: FileItem): FileItem | Thenable<FileItem> {
        return element;
    }
    
    getChildren(element?: any): ProviderResult<FileItem[]> {
        if (!element) {
            // Since there is no element, this is the start of the TreeDataProvider
            // Generate the tree and return the list of children from the root
            return this.constructTree().then(() => {
                return this.createChildren(this.tree, [])
            })
        } else {
            var treePosition = this.tree;

            // Using the path, navigate to this elements position on the tree
            element.getRelativePath().forEach((dir: string) => {
                treePosition = treePosition[dir]
            })

            // Return the children of this tree position
            return this.createChildren(treePosition, element.getRelativePath())
        }
    }

    /**
     * Reloads the data and generates a new file tree
     */
    refresh(): void {
        this._onDidChangeTreeData.fire()
	}

    /**
     * Gets the parent branch
     * @returns the parent branch
     */
    public getBranch(): string {
        return this.parentBranch
    }

    /**
     * Get the local branches from git
     * The current branch will be prepended with "* "
     * @returns the list of local branches
     */
    public async getBranches(): Promise<string[]> {
        const branches = await execShell(`cd ${this.workspaceRoot}; git branch`)
        return branches.split('\n')
            .filter(branch => branch !== '')
            .map(branch => {
                return branch.replace('  ', '').replace('\n','')
            })
    }

    /**
     * Updates the parent branch and refreshes the data from the provider
     * @param newParentBranch the desired parent branch
     */
    public setParentBranch(newParentBranch: string): void {
        this.parentBranch = newParentBranch
        this.refresh()
    }

    /**
     * Calls getParentBranch() and updates the provider's parentBranch accordingly
     * This will also trigger a refresh of the provider data
     */
    public refreshParentBranch(): void {
        this.getParentBranch().then(parent => {
            this.setParentBranch(parent)
        })
    }

    /**
     * Gets the files changed between the current branch and the parent branch
     * using `git diff --name-only ${parentBranch}`
     * @returns a list of changed files
     */
    private async getChangedFiles(): Promise<string[]> {
        // Get the changed files by using `git diff`
        const files = await execShell(`cd ${this.workspaceRoot}; git diff --name-only ${this.parentBranch}`)

        // Split the files by newline and remove empty lines
        return files.split('\n').filter(file => file !== '')            
    }

    /**
     * Builds and saves a dict representing the file structure of the changed files
     * This will update the BranchDiffProvider's tree attribute
     */
    private async constructTree(): Promise<void> {
        // Reset the tree
        this.tree = {}

        // Get the changed files by using `git diff`
        const files = await this.getChangedFiles()

        // Construct the tree from the list of files
        files.forEach(file => {
            // Start at the top of the tree
            var treePosition = this.tree;

            // Split the file into its paths
            // (e.g. src/docs/unit1 -> [src, docs, unit1])
            // and walk down the tree, 
            // adding newly discovered dirs as you go
            file.split('/').forEach(dir => {
                if (!(dir in treePosition)) {
                    treePosition[dir] = {}
                }

                // Update the position to be the current dir
                treePosition = treePosition[dir]
            })
        })
    }

    /**
     * This function attempts to determine the parent branch through a series of bash commands
     * @returns the parent branch or an empty string
     */
    private async getParentBranch(): Promise<string> {
        const parentBranch = await execShell(
            `cd ${this.workspaceRoot};` + 
            ' git show-branch | sed "s/].*//" | grep "\\*" | grep -v "$(git rev-parse --abbrev-ref HEAD)" | head -n1 | sed "s/^.*\\[//"'
        )

        // Remove the newline and disregard anything after the ~ or ^
        return parentBranch.replace('\n','').split('~')[0].split('^')[0]
    }

    /**
     * Generate a list of FileItems representing the children of the treePosition
     * @param treePosition an object for a position in the tree that contains a dict of children
     * @param relativePath a list of the directories from root to the treePosition
     * @returns a list of FileItems representing the children of the given treePosition
     */
    private createChildren(treePosition: any, relativePath: string[]): FileItem[] {
        // For each child of the current treePosition, map it to a FileItem object 
        return Object.keys(treePosition).map(key => {
            var child = treePosition[key]

            // The number of children that this child has
            var numChildren = Object.keys(child).length 

            if (numChildren != 1) {
                // If there are 0 children, this item is a file and its collapsible state should be None
                // If there are 2 or more children, this item is a folder and its collapsible state should be Expanded
                const collapsibleState = numChildren == 0 ? TreeItemCollapsibleState.None : TreeItemCollapsibleState.Expanded
                return new FileItem(this.workspaceRoot, relativePath.concat(key), collapsibleState)
            }

            // If there is only 1 child, this FileItem will be a compact folder
            // (Single child folders will be compressed into a combined tree item)
            // 
            // This while-loop continues down the single child folders, 
            // adding each to the compactPath, until it reaches the end (0 children) 
            // or a folder with multiple children (2 or more)
            const compactPath = [key]
            while (numChildren == 1) {
                // Get the only child's key
                var childKey = Object.keys(child)[0]
                
                // Add the child's key to the path
                compactPath.push(childKey)
                
                // Iterate to next child
                var child = child[childKey]
                numChildren = Object.keys(child).length
            }

            if (numChildren == 0) {
                // The last item has no children, meaning it must be a file
                // This should be a seperate FileItem on the tree, so we remove it from the compact path
                // It will be dealt with later when `getChildren` is called on this FileItem
                compactPath.pop()
            } 

            // Since this FileItem is a compact path of multiple folders,
            // we need a custom label that contains all of the folders' names
            // (e.g. src/docs/unit1)
            const label = compactPath.join('/')
            return new FileItem(this.workspaceRoot, relativePath.concat(compactPath), TreeItemCollapsibleState.Expanded, label)
        })
    } 
}

class FileItem extends TreeItem {
    /**
     * 
     * @param root the workspace root
     * @param relativePath a list of directories from the root to the file item
     * @param collapsibleState 
     * @param label the title of the item shown in the explorer view
     */
    constructor(
        private root: string | undefined,
        public readonly relativePath: string[],
        public collapsibleState: TreeItemCollapsibleState,
        public label?: string
    ) {
        super(Uri.file(root + "/" + relativePath.join('/')), collapsibleState);

        if (collapsibleState === TreeItemCollapsibleState.None) {
            // Files will have a collapsible state of none
            // Clicking on a file will open the file in vscode
            this.command = {
                title: "",
                command: "vscode.open",
                arguments: [Uri.file(root + "/" + relativePath.join('/'))]
            }
        }
    }

    public getRelativePath(): string[] {
        return this.relativePath
    }
}
