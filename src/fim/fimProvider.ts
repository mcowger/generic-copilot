// large portions of this code are copied under Apache 2.0 license from https://github.com/fsiovn/ai-autocomplete/blob/main/extension.js

import * as vscode from 'vscode';
import {FILENAME_SENSITIVE_KEYWORDS} from "./constants"
import { openAICompatibleFillInMiddle } from './fimOAI';
import { getModelItemFromString, getCoreDataForModel } from '../utils'
import { ModelItem, ModelDetails } from '../types';

// Constants
const TAG = 'FIMProvider';


interface InlineCompletionContext {
    triggerKind: vscode.InlineCompletionTriggerKind;
}


async function registerInlineCompletionItemProvider(context: vscode.ExtensionContext): Promise<void> {
    try {
        const inlineCompletionItemDocumentSelector: vscode.DocumentSelector = { pattern: '**' };


        const inlineCompletionItemProvider: vscode.InlineCompletionItemProvider = {

            provideInlineCompletionItems: async (
                document: vscode.TextDocument,
                position: vscode.Position,
                _inlineCompletionContext: InlineCompletionContext,
                token: vscode.CancellationToken
            ): Promise<vscode.InlineCompletionItem[] | null> => {
                try {
                    const secrets: vscode.SecretStorage = context.secrets
                    const modelId = "mistralai/codestral-2508"
                    const modelItem: ModelItem = getModelItemFromString(modelId)
                    const modelDetails: ModelDetails = await getCoreDataForModel(modelItem, secrets)
                    // Using getText for multi lines
                    // Using substring for single line for better performance
                    const currentLine = document.lineAt(position.line);
                    const linePrefix = currentLine.text.substring(0, position.character);

                    if (linePrefix === '}') {
                        return null;
                    }

                    if (String(linePrefix).startsWith('</') && String(linePrefix).endsWith('>')) {
                        return null;
                    }

                    const filename = document.fileName;

                    if (FILENAME_SENSITIVE_KEYWORDS.some(filenameSensitiveKeyword =>
                        filename.toLowerCase().includes(filenameSensitiveKeyword))) {
                        console.debug('Skip sensitive file', filename);
                        return null;
                    }

                    // Cancel on change
                    if (token.isCancellationRequested) {
                        console.debug('Cancel on change');
                        return null;
                    }

                    // if (!String(geminiAPIKey).startsWith('csk-') &&
                    //     inlineCompletionContext?.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
                    //     return null;
                    // }

                    const delayRatio = 2

                    // Debounce
                    await new Promise(resolve => setTimeout(resolve, 500 * delayRatio));

                    // Allow tab
                    if (linePrefix?.trim()?.length === 0) {
                        // Debounce
                        await new Promise(resolve => setTimeout(resolve, 1000 * delayRatio));

                        // Cancel on change
                        if (token.isCancellationRequested) {
                            console.debug('Cancel on change after delay for tab');
                            return null;
                        }
                    }

                    const startPosition = new vscode.Position(0, 0);
                    const prefix = document.getText(new vscode.Range(startPosition, position));

                    const lastLine = document.lineCount - 1;
                    const endPosition = document.lineAt(lastLine).range.end;
                    const suffix = document.getText(new vscode.Range(position, endPosition));

                    const insertText = await openAICompatibleFillInMiddle(
                        context,
                        token,
                        filename,
                        document?.languageId,
                        prefix,
                        suffix,
                        modelDetails.baseUrl,
                        modelDetails.modelApiKey!,
                        modelDetails.modelItem.id,
                        modelDetails.headers
                    )

                    if (!insertText || !insertText?.trim() || insertText?.trim().length < 9) {
                        console.debug('Skip short suggestion', { insertText });
                        return null;
                    }

                    const inlineCompletionItems: vscode.InlineCompletionItem[] = [];

                    try {
                        const keywordPrefix = linePrefix.replace(/\./g, '').split(/\s+/).pop();

                        if (keywordPrefix && (linePrefix.length < 9 || keywordPrefix.length > 1) &&
                            String(insertText).startsWith(keywordPrefix)) {
                            inlineCompletionItems.push(
                                new vscode.InlineCompletionItem(
                                    insertText.slice(keywordPrefix.length),
                                    new vscode.Range(position, position)
                                )
                            );
                        }
                    } catch (error) {
                        console.error('Deduplicate prefix of keyword ', error);
                    }

                    inlineCompletionItems.push(
                        new vscode.InlineCompletionItem(
                            insertText,
                            new vscode.Range(position, position)
                        )
                    );

                    if (String(linePrefix).endsWith('.')) {
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                String(insertText).replace(/^[\s.]+/, ''),
                                new vscode.Range(position, position)
                            )
                        );
                    } else if (String(linePrefix).endsWith(' ')) {
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                String(insertText).replace(/^[\s.]+/, ''),
                                new vscode.Range(position, position)
                            )
                        );
                    } else if (String(linePrefix).endsWith(';')) {
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                `\n${insertText}`,
                                new vscode.Range(position, position)
                            )
                        );
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                `\n\n${insertText}`,
                                new vscode.Range(position, position)
                            )
                        );
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                `\n\n\n${insertText}`,
                                new vscode.Range(position, position)
                            )
                        );
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                `\n\n\n\n${insertText}`,
                                new vscode.Range(position, position)
                            )
                        );
                    } else {
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                ` ${insertText}`,
                                new vscode.Range(position, position)
                            )
                        );
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                `\n${insertText}`,
                                new vscode.Range(position, position)
                            )
                        );
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                `\n\n${insertText}`,
                                new vscode.Range(position, position)
                            )
                        );
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                `\n\n\n${insertText}`,
                                new vscode.Range(position, position)
                            )
                        );
                        inlineCompletionItems.push(
                            new vscode.InlineCompletionItem(
                                `\n\n\n\n${insertText}`,
                                new vscode.Range(position, position)
                            )
                        );
                    }

                    return inlineCompletionItems;

                } catch (error) {
                    console.error(error);
                    return null;
                }
            }
        };

        const inlineCompletionItemProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
            inlineCompletionItemDocumentSelector,
            inlineCompletionItemProvider
        );

        context.subscriptions.push(inlineCompletionItemProviderDisposable);

    } catch (error) {
        console.error('registerInlineCompletionItemProvider', error);
    }
}

export function deactivate(): void { }

export { registerInlineCompletionItemProvider };