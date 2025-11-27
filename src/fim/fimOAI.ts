import * as vscode from 'vscode';
import { FIM_INSTRUCTION } from "./constants"
import OpenAI from 'openai';



export async function openAICompatibleFillInMiddle(
    context: vscode.ExtensionContext,
    token: vscode.CancellationToken,
    filename: string,
    programmingLanguage: string,
    prefix: string,
    suffix: string,
    baseURL: string,
    apiKey: string,
    model: string,
    headers?: Record<string, string>
): Promise<string | null> {

    try {
        // Cancel on change
        if (token.isCancellationRequested) {
            console.debug('Cancel on change - OAI FIM');
            return null;
        }

    } catch (error) {
        console.error('openAICompatibleFillInMiddle', error);
    }

    try {

        const openAIrequest: OpenAI.ChatCompletionCreateParams = {
            model,
            messages: [
                {
                    role: 'system',
                    content: FIM_INSTRUCTION
                },
                {
                    role: 'user',
                    content: `${FIM_INSTRUCTION}
<filename>${filename}</filename>
<programming_language>${programmingLanguage}</programming_language>
<fim_prefix>${prefix}</fim_prefix>
<fim_suffix>${suffix}</fim_suffix>`
                }
            ],
            temperature: 0.5,
            stream: false,
        };

        const openai = new OpenAI({
            baseURL: baseURL,
            apiKey: apiKey,
            defaultHeaders: headers ? headers : {}
        });

        const fimResponse: OpenAI.Chat.Completions.ChatCompletion = await openai.chat.completions.create(openAIrequest);

        // if (!response.ok && models?.length < 1) {
        //     vscode.window.showErrorMessage(`API call failed with status ${response.status}`);
        //     console.warn('API call failed', { model, response });
        //     return null;
        // }

        const content = fimResponse.choices[0].message.content || undefined


        if (content === '<fim_middle></fim_middle>') {
            return null;
        }

        const insertText =
            content?.trim()?.match(/^<fim_middle>([\s\S]*?)<\/fim_middle>$/s)?.[1] || null;

        if (!insertText) { //recusively try again for a bad response.
            vscode.window.showErrorMessage(`Got bad inline completion response, trying again...`);
            return await openAICompatibleFillInMiddle(
                context,
                token,
                filename,
                programmingLanguage,
                prefix,
                suffix,
                baseURL,
                apiKey,
                model
            );
        }

        console.debug({
            model,
            filename,
            programmingLanguage,
            prefix,
            suffix,
            insertText
        });

        if (!insertText || !insertText.trim() || insertText.trim().length < 9) {
            console.debug('Skip short suggestion', { insertText });
            return null;
        }

        return insertText;

    } catch (error) {
        console.error('openAICompatibleFillInMiddle', error);
        return null;
    }
}
