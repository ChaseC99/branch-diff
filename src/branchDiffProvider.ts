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

    private createChildren(treePosition: any, relativePath: string[]): FileItem[] {
        return Object.keys(treePosition).map(key => {
            const collapsibleState = Object.keys(treePosition[key]).length === 0 ? TreeItemCollapsibleState.None : TreeItemCollapsibleState.Expanded
            return new FileItem(this.workspaceRoot, relativePath.concat(key), collapsibleState)
        })
    } 
}

class FileItem extends TreeItem {
    constructor(
        private root: string | undefined,
        public readonly relativePath: string[],
        public collapsibleState: TreeItemCollapsibleState,
    ) {
        super(Uri.file(root + "/" + relativePath.join('/')), collapsibleState);

        if (collapsibleState === TreeItemCollapsibleState.None) {
            this.command = {
                title: "",
                command: "vscode.open",
                arguments: [Uri.file(root + "/" + relativePath.join('/'))]
            }
        }
        
        // this.tooltip = `${this.label}-${this.version}`;
        // this.description = "test";
    }

    public getRelativePath(): string[] {
        return this.relativePath
    }
}
