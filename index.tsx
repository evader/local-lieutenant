/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { GoogleGenAI, Chat } from '@google/genai';
import { marked } from 'marked';

// Per coding guidelines, the API key must be read from process.env.API_KEY.
// The build environment must be configured to handle this.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION_ASSISTANT = `You are Local Lieutenant, an AI expert in shell commands, programming, and system administration. Your persona is helpful, knowledgeable, and slightly formal, like a trusted technical aide. Your primary goal is to help users by providing accurate commands and clear, concise explanations.

When a user asks for a command or code:
1.  Provide the command or code snippet inside a markdown code block.
2.  Follow the code block with a brief explanation of what it does, its main options, and any important considerations or potential risks.
3.  Be proactive. If a command is risky (e.g., 'rm -rf'), add a clear warning.
4.  Maintain your persona as the "Local Lieutenant" throughout the conversation.`;

const SYSTEM_INSTRUCTION_COMMAND = `You are an expert shell command generator. Based on the user request, provide a single, executable shell command. Respond with ONLY the raw command, nothing else. Do not use markdown, explanations, or any surrounding text.`;


type Message = {
  role: 'user' | 'model';
  content: string;
  isCommand?: boolean;
};

type Mode = 'assistant' | 'command';

function App() {
  const [chat, setChat] = useState<Chat | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('assistant');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const chatInstance = ai.chats.create({
      model: 'gemini-2.5-flash-preview-04-17',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_ASSISTANT,
      },
    });
    setChat(chatInstance);
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
    // This effect adds copy buttons to code blocks generated from markdown
    chatContainerRef.current?.querySelectorAll('pre').forEach((pre) => {
      if (pre.parentElement?.classList.contains('command-wrapper') || pre.querySelector('.copy-btn')) {
        return; // Skip command blocks (handled in JSX) or if button exists
      }
      const button = document.createElement('button');
      button.innerText = 'Copy';
      button.className = 'copy-btn';
      button.setAttribute('aria-label', 'Copy code to clipboard');
      button.onclick = () => {
        const code = pre.querySelector('code')?.innerText || '';
        navigator.clipboard.writeText(code).then(() => {
          button.innerText = 'Copied!';
          setTimeout(() => {
            button.innerText = 'Copy';
          }, 2000);
        });
      };
      pre.appendChild(button);
    });
  }, [history, isLoading]);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: inputValue };
    setHistory((prev) => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsLoading(true);

    if (mode === 'assistant') {
      if (!chat) {
        setIsLoading(false);
        return;
      }
      try {
        const stream = await chat.sendMessageStream({ message: currentInput });
        let currentModelResponse = '';
        setHistory((prev) => [...prev, { role: 'model', content: '' }]);

        for await (const chunk of stream) {
          currentModelResponse += chunk.text;
          setHistory((prev) => {
            const newHistory = [...prev];
            newHistory[newHistory.length - 1].content = currentModelResponse;
            return newHistory;
          });
        }
      } catch (error) {
        console.error(error);
        const errorMessage: Message = { role: 'model', content: 'Sorry, I encountered an error. Please try again.' };
        setHistory((prev) => [...prev, errorMessage]);
      }
    } else { // Command mode
      try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-04-17',
            contents: currentInput,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_COMMAND,
            }
        });
        const command = response.text.trim();
        const modelMessage: Message = { role: 'model', content: command, isCommand: true };
        setHistory((prev) => [...prev, modelMessage]);
      } catch (error) {
         console.error(error);
         const errorMessage: Message = { role: 'model', content: 'Sorry, I could not generate the command. Please try again.' };
         setHistory((prev) => [...prev, errorMessage]);
      }
    }

    setIsLoading(false);
  };
  
  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
  };

  const handleClearChat = () => {
    setHistory([]);
  };

  const placeholderText = mode === 'assistant'
    ? "Ask your Lieutenant anything..."
    : "Describe the command you want to generate...";

  return (
    <>
      <header>
        <h1>Local Lieutenant</h1>
        <button class="clear-btn" onClick={handleClearChat} aria-label="Clear chat history">Clear Chat</button>
      </header>
      <div class="chat-container" ref={chatContainerRef}>
        {history.map((msg, index) => (
          <div key={index} class={`message ${msg.role} ${msg.isCommand ? 'command-output' : ''}`}>
            {msg.isCommand ? (
                 <div class="content">
                    <p class="command-intro">Suggested command to run on your server:</p>
                    <div class="command-wrapper">
                      <pre><code>{msg.content}</code></pre>
                      <button
                        class="copy-btn"
                        aria-label="Copy command to clipboard"
                        onClick={(e) => {
                          const button = e.currentTarget as HTMLButtonElement;
                          navigator.clipboard.writeText(msg.content).then(() => {
                            button.innerText = 'Copied!';
                            button.dataset.copied = 'true';
                            setTimeout(() => {
                              button.innerText = 'Copy';
                              delete button.dataset.copied;
                            }, 2000);
                          });
                        }}
                      >
                        Copy
                      </button>
                    </div>
                 </div>
            ) : (
                 <div
                    class="content"
                    dangerouslySetInnerHTML={{ __html: msg.role === 'model' ? marked.parse(msg.content) : msg.content }}
                 ></div>
            )}
          </div>
        ))}
        {isLoading && (
           <div class="message model">
             <div class="content">
                <div class="loading-indicator">
                  <div class="spinner"></div>
                  <span>Thinking...</span>
                </div>
            </div>
           </div>
        )}
      </div>
      <div class="input-area">
        <div class="mode-selector">
            <input type="radio" id="mode-assistant" name="mode" value="assistant" checked={mode === 'assistant'} onChange={() => handleModeChange('assistant')} aria-label="AI Assistant Mode"/>
            <label for="mode-assistant">AI Assistant</label>
            <input type="radio" id="mode-command" name="mode" value="command" checked={mode === 'command'} onChange={() => handleModeChange('command')} aria-label="Command Generator Mode"/>
            <label for="mode-command">Command Generator</label>
        </div>
        <form class="input-form" onSubmit={handleSubmit}>
            <input
            type="text"
            value={inputValue}
            onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
            placeholder={placeholderText}
            aria-label="Your message"
            disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !inputValue.trim()} aria-label="Send message">
            <span>&rarr;</span>
            </button>
        </form>
      </div>
    </>
  );
}

render(<App />, document.getElementById('app')!);