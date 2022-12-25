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

	// The branchDiff.refresh command has been defined in the package.json file
	// Have it trigger the branchDiffProvider.refresh() function
	vscode.commands.registerCommand('branchDiff.refresh', () => {
		branchDiffProvider.refresh()
	});
}

// This method is called when your extension is deactivated
export function deactivate() {}
