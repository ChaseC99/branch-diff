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

        this.parentBranch = "main"
        this.getParentBranch().then(result => {
            this.parentBranch = result
            this.refresh()
        })
    }

    refresh(): void {
        this._onDidChangeTreeData.fire()
	}

    getTreeItem(element: FileItem): FileItem | Thenable<FileItem> {
        return element;
    }
    
    getChildren(element?: any): ProviderResult<FileItem[]> {
        if (!element) {
            return this.getFiles()
        } else {
            var treePosition = this.tree;
            element.getRelativePath().forEach((dir: string) => {
                treePosition = treePosition[dir]
            })

            return this.createChildren(treePosition, element.getRelativePath())
        }
    }

    public getBranch(): string {
        return this.parentBranch
    }

    public async getBranches(): Promise<string[]> {
        const branches = await execShell(`cd ${this.workspaceRoot}; git branch`)
        return branches.split('\n')
            .filter(branch => branch !== '')
            .map(branch => {
                return branch.replace('  ', '').replace('\n','')
            })
    }

    public setBranch(branch: string): void {
        this.parentBranch = branch
        this.refresh()
    }

    public refreshParentBranch(): void {
        this.getParentBranch().then(parent => {
            this.setBranch(parent)
        })
    }

    private async getFiles(): Promise<FileItem[]> {
        this.tree = {}
        const files = await execShell(`cd ${this.workspaceRoot}; git diff --name-only ${this.parentBranch}`)
        files.split('\n')
            .filter(file => file !== '')
            .forEach(file => {
                var treePosition = this.tree;
                file.split('/').forEach(dir => {
                    if (!(dir in treePosition)) {
                        treePosition[dir] = {}
                    }
                    treePosition = treePosition[dir]
                })
            })

        return this.createChildren(this.tree, [])
    }

    private async getParentBranch(): Promise<string> {
        const parentBranch = await execShell(
            `cd ${this.workspaceRoot};` + 
            ' git show-branch | sed "s/].*//" | grep "\\*" | grep -v "$(git rev-parse --abbrev-ref HEAD)" | head -n1 | sed "s/^.*\\[//"'
        )

        return parentBranch !== "" ? parentBranch.replace('\n','') : 'master'
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
    constructor(
        private root: string | undefined,
        public readonly relativePath: string[],
        public collapsibleState: TreeItemCollapsibleState,
        public label?: string
    ) {
        super(Uri.file(root + "/" + relativePath.join('/')), collapsibleState);

        if (collapsibleState === TreeItemCollapsibleState.None) {
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
