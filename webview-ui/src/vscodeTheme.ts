const themedVariables: Record<string, string> = {
  '--background': 'var(--vscode-editor-background)',
  '--foreground': 'var(--vscode-editor-foreground)',
  '--card': 'var(--vscode-editor-background)',
  '--card-foreground': 'var(--vscode-editor-foreground)',
  '--popover': 'var(--vscode-menu-background, var(--vscode-editorWidget-background))',
  '--popover-foreground': 'var(--vscode-menu-foreground, var(--vscode-editorWidget-foreground))',
  '--primary': 'var(--vscode-button-background)',
  '--primary-foreground': 'var(--vscode-button-foreground)',
  '--secondary': 'var(--vscode-button-secondaryBackground)',
  '--secondary-foreground': 'var(--vscode-button-secondaryForeground)',
  '--muted': 'var(--vscode-editor-inactiveSelectionBackground)',
  '--muted-foreground': 'var(--vscode-descriptionForeground)',
  '--accent': 'var(--vscode-list-hoverBackground)',
  '--accent-foreground': 'var(--vscode-list-hoverForeground, var(--vscode-editor-foreground))',
  '--border': 'var(--vscode-panel-border, var(--vscode-input-border))',
  '--input': 'var(--vscode-input-background)',
  '--ring': 'var(--vscode-focusBorder)',
};

export function applyVsCodeTheme(): void {
  for (const [name, value] of Object.entries(themedVariables)) {
    document.documentElement.style.setProperty(name, value);
  }
}
