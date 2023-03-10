// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { BranchDiffProvider } from './branchDiffProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const rootPath = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		? vscode.workspace.workspaceFolders[0].uri.fsPath
		: undefined
	
	// Create BranchDiffProvider
	const branchDiffProvider = new BranchDiffProvider(rootPath)
	// Register it with the window
	vscode.window.registerTreeDataProvider("branchDiff", branchDiffProvider)
	// Refresh the extension on document save
	vscode.workspace.onDidSaveTextDocument(() => {
		branchDiffProvider.refresh()
	})

	// Refresh the parent branch when the git branch changes
	const gitWatcher = vscode.workspace.createFileSystemWatcher("**/HEAD")
	gitWatcher.onDidChange(() => {
		branchDiffProvider.refreshParentBranch()
	})

	// Register the commands from package.json
	// The refresh button
	vscode.commands.registerCommand('branchDiff.refresh', () => {
		branchDiffProvider.refresh()
	});
	// The change parent branch button
	vscode.commands.registerCommand('branchDiff.setBranch', async () => {
		const branches = await branchDiffProvider.getBranches()
		const quickPickOptions = branches.map(branch => {
			var description;
			if (branch.at(0) === '*') {
				description = 'current branch'
			} 
			if (branch === branchDiffProvider.getBranch()) {
				description = 'parent branch'
			}
			return {"label": branch, "description": description}
		})

		const result = await vscode.window.showQuickPick(
			quickPickOptions,
			{placeHolder: "Select a branch", title: "Change Parent Branch to Compare"}
		)
		if (result && result.label.at(0) !== '*') {
			branchDiffProvider.setParentBranch(result.label)
		}
	})
}

// This method is called when your extension is deactivated
export function deactivate() {}
