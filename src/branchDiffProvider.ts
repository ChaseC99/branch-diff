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
    constructor(private workspaceRoot: string | undefined) {
        this.tree = {}
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

    private async getFiles(): Promise<FileItem[]> {
        this.tree = {}
        await execShell("cd " + this.workspaceRoot + "; pwd")
        const files = await execShell("cd " + this.workspaceRoot + "; git diff main --name-only")
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
