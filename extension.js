const vscode = require('vscode');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

let apiKey=''
/**
 * @param {vscode.ExtensionContext} context
 * @param {Object} json
 */
async function activate(context) {
    // Register the command for asking ChatGPT
    let askBluCommand = vscode.commands.registerCommand('blu.askBlu', async function () {
        const isLoggedIn = await fetchToken();

        if (!isLoggedIn) {
            await promptForToken(); // Prompt user to enter their token
            return; // Exit if not logged in
        }

        // Get the active editor
        const editor = vscode.window.activeTextEditor;

        if (editor) {
            const text = editor.document.getText(editor.selection);
            if (text.length === 0) {
                vscode.window.showErrorMessage("Please select some text.");
                return;
            }

            const response = await askChatGPT(text);
            if (response) {
                editor.edit(editBuilder => {
                    editBuilder.replace(editor.selection, response);
                });
            }
        }
    });

    // Register the command for opening the chat panel
    let chatPanelCommand = vscode.commands.registerCommand('blu.openChatPanel', async function () {
        const isLoggedIn = await fetchToken();
        if (!isLoggedIn) {
            await promptForToken(); // Prompt user to enter their token
            return; // Exit if not logged in
        }
        openChatPanel(context);
    });
    

    context.subscriptions.push(askBluCommand);
    context.subscriptions.push(chatPanelCommand);
}

async function fetchToken() {
    // This function would check if the API token is set
    if (apiKey) {
        return true; // Return true if logged in
    }
    return false; // Return false if not logged in
}

async function promptForToken() {
    const token = await vscode.window.showInputBox({
        placeHolder: "Enter your API token",
        prompt: "You need to log in. Please enter your API token.",
        ignoreFocusOut: true, // Keep the input box open even when clicking outside
    });

    if (token) {
        apiKey = token; // Set the token
        vscode.window.showInformationMessage("API token set successfully.");
    } else {
        vscode.window.showErrorMessage("Login cancelled. Please try again.");
    }
}

async function askChatGPT(prompt) {
    if (!apiKey) {
        vscode.window.showErrorMessage("API key not set. Please log in first.");
        return null; // Ensure the API key is set
    }

    const endpoint = ""; // OpenAI completion endpoint

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
    };

    // Structure the request for chat-based models
    const body = {
        model: "gpt-4o-mini", // Replace with the model you want to use
        messages: [
            { role: "system", content: "You are an assistant that generates only code responses. Do not provide explanations; just return the code. If the code can fit in a single file, return it directly. If multiple files are needed, present the code in a JSON format where the keys are the file paths and the values are the corresponding code. For example: {\"file_path\": \"code that should be in the file\"}. If a file name is specified in the prompt, return the code in JSON format with the file name as the key. If no file name is mentioned, return only the code. Replace all occurrences of \\. with . in the code."}, 
            { role: "user", content: prompt } // User's prompt
        ],
        temperature: 0.2
    };

    try {
        // Log the request body for debugging
        // console.log("Sending API request to OpenAI:", JSON.stringify(body));

        const response = await fetch(endpoint, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(body)
        });

        const data = await response.json();

        // Log the full response for debugging
        console.log("OpenAI API response:", JSON.stringify(data));

        if (data && data.choices && data.choices.length > 0 && data.choices[0].message) {

            const cleanedContent = cleanOutput(data.choices[0].message.content.trim());

            try {
                console.log('\n\n\n\n\n\n',cleanedContent,'\n\n\n\n\n\n\n')

                // console.log("\n\n\n\n\n",cleanedContent[0],"\n\n\n\n\n")

                if (cleanedContent[0]=='{'){
                findBadCharacter(cleanedContent)
                const response = JSON.parse(cleanedContent);
                console.log('\n\n\n\n\n\n',response,'\n\n\n\n\n\n\n')

                // console.log("\n\n\n\n\n",response.length,"\n\n\n\n\n")
 
                // Check if the response is in the expected dictionary format
                if (typeof response === 'object') {
                    // console.log('\n\n\n\n',response,'\n\n\n\n')
                    await createFiles(response); // Create files with the provided code
                    vscode.window.showInformationMessage("Files created successfully.");
                    return; // Exit after creating files
                }}
            } catch (jsonError) {
                console.error("Failed to parse JSON from response:", jsonError);
                vscode.window.showErrorMessage("Failed to parse response from ChatGPT.");
            }

            // If not in the expected format, replace the selected text with the cleaned output
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.edit(editBuilder => {
                    editBuilder.replace(editor.selection, cleanedContent);
                });
            }
            
        } else {
            console.error("Unexpected API response:", data);
            vscode.window.showErrorMessage("Unexpected response from ChatGPT.");
            return null;
        }
    } catch (error) {
        vscode.window.showErrorMessage("Error with OpenAI API: " + error.message);
        console.error("API request failed:", error);
        return null;
    }
}

async function createFiles(files) {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder is open.");
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    // console.log(workspacePath)

    for (const [fileName, content] of Object.entries(files)) {
        const filePath = path.join(workspacePath, fileName);
        const dir = path.dirname(filePath);

        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Create the directory if it doesn't exist
            fs.writeFile(filePath, content, (err) => {
                if (err) {
                    console.error(`Error writing file ${filename}:`, err);
                } else {
                    // console.log(`Successfully created ${filename}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create file: ${filePath}. Error: ${error.message}`);
        }
    }
}

function cleanOutput(output) {
    // Remove unwanted characters or formatting
    return output.replace(/```[a-z]*\n|\n```/g, '').trim(); // Removes code block markers
}

function findBadCharacter(jsonString) {
    try {
        // Attempt to parse the JSON string
        JSON.parse(jsonString);
    } catch (error) {
        // Check if the error is a SyntaxError
        if (error instanceof SyntaxError) {
            // Extract the position from the error message
            const positionMatch = error.message.match(/position (\d+)/);
            if (positionMatch) {
                const position = parseInt(positionMatch[1], 10);
                
                // Get a substring around the error position for inspection
                const start = Math.max(0, position - 10);
                const end = Math.min(jsonString.length, position + 10);
                const errorSnippet = jsonString.substring(start, end);
                
                console.log(`Error at position ${position}:`);
                console.log(`Snippet: "${errorSnippet}"`);
                console.log(`Bad character: "${jsonString[position]}"`);
            } else {
                console.log("Could not determine the position of the error.");
            }
        } else {
            console.log("An error occurred:", error);
        }
    }
}

function openChatPanel(context) {
    const panel = vscode.window.createWebviewPanel(
        'chatPanel', // Identifies the type of the webview. Used internally
        'Chat with Blu', // Title of the panel displayed to the user
        vscode.ViewColumn.Beside, // Editor column to show the new webview panel in
        {
            enableScripts: true // Enable JavaScript in the webview
        }
    );

    // Set the HTML content for the webview
    panel.webview.html = getWebviewContent();

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'askGPT':
                    const response = await askGPT(message.text);
                    panel.webview.postMessage({ command: 'response', text: response });
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
}

function getWebviewContent() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chat with Blu</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                height: 100vh;
                background-color: #1e1e1e;
                color: #ffffff;
            }
            #chat {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                border-bottom: 1px solid #444;
                background-color: #2d2d2d;
                box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5);
            }
            #input {
                display: flex;
                padding: 10px;
                background-color: #2d2d2d;
                border-top: 1px solid #444;
            }
            #input textarea {
                flex: 1;
                padding: 10px;
                font-size: 14px;
                border: 1px solid #444;
                border-radius: 5px;
                background-color: #3c3c3c;
                color: #ffffff;
                resize: none;
            }
            #input button {
                padding: 10px 15px;
                margin-left: 10px;
                font-size: 14px;
                border: none;
                border-radius: 5px;
                background-color: #007acc;
                color: #ffffff;
                cursor: pointer;
                transition: background-color 0.3s;
            }
            #input button:hover {
                background-color: #005a9e;
            }
            .message {
                margin: 10px 0;
                padding: 10px;
                border-radius: 5px;
                position: relative;
            }
            .message strong {
                display: block;
                margin-bottom: 5px;
            }
            .message.user {
                background-color: #007acc;
                color: #ffffff;
                align-self: flex-end;
            }
            .message.chatgpt {
                background-color: #444;
                color: #ffffff;
                align-self: flex-start;
            }
            
            pre {
                background-color: black;
                color:#005a9e
                overflow-wrap: break-word; /* Allows long words to break */
                word-wrap: break-word; /* Older property for compatibility */
            }

            code{
                background-color: black;
                ont-family: Arial, Helvetica, sans-serif;
            }
        </style>
    </head>
    <body>
        <div id="chat"></div>
        <div id="input">
            <textarea id="userInput" rows="3" placeholder="Ask Blu..."></textarea>
            <button id="sendButton">Send</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();

            document.getElementById('sendButton').addEventListener('click', () => {
                const userInput = document.getElementById('userInput').value;
                if (userInput) {
                    addMessageToChat('You', userInput, 'user');
                    vscode.postMessage({ command: 'askGPT', text: userInput });
                    document.getElementById('userInput').value = '';
                }
            });

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'response') {
                    addMessageToChat('Blu', message.text, 'chatgpt');
                }
            });

            function addMessageToChat(sender, text, type) {
                const chat = document.getElementById('chat');
                const messageElement = document.createElement('div');
                messageElement.className = 'message ' + type;
                messageElement.innerHTML = '<strong>' + sender + ':</strong> ' + text;
                chat.appendChild(messageElement);
                chat.scrollTop = chat.scrollHeight;
            }
        </script>
    </body>
    </html>
    `;
}

async function askGPT(prompt) {
    if (!apiKey) {
        vscode.window.showErrorMessage("API key not set. Please log in first.");
        return null; // Ensure the API key is set
    }

    const endpoint = ""; // OpenAI completion endpoint

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
    };

    const body = {
        model: "gpt-4o-mini", // Replace with the model you want to use
        messages: [
            { role: "system",content:'You are a helpful assistant.Your name is Blu.'},
            { role: "user", content: prompt }
        ],
    };

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(body)
        });

        const data = await response.json();
        console.log('\n\n\n\n',data,'\n\n\n\n')

        if (data && data.choices && data.choices.length > 0 && data.choices[0].message) {
            return formatResponse(data.choices[0].message.content.trim());
        } else {
            console.error("Unexpected API response:", data);
            vscode.window.showErrorMessage("Unexpected response from ChatGPT.");
            return null;
        }
    } catch (error) {
        vscode.window.showErrorMessage("Error with OpenAI API: " + error.message);
        console.error("API request failed:", error);
        return null;
    }
}

function formatResponse(response) {
    // Basic formatting for code blocks and headings
    let formattedResponse = response
        .replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>') // Code blocks
        .replace(/### (.*?)\n/g, '<h3>$1</h3>') // H3 headings
        .replace(/## (.*?)\n/g, '<h2>$1</h2>') // H2 headings
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g,'<b>$1</b>'); // New lines to <br>

    return `<div class="response">${formattedResponse}</div>`;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
