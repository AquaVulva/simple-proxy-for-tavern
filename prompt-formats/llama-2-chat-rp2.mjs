import {
  getLastChatMessage,
  addStoppingStrings,
  popLastAssistantMessage,
  popLastChatMessages,
  replaceTemplates,
} from "../src/utils.mjs";
  

export default ({ user, assistant, messages, config, generationConfig }) => {
  const systemPrompt = "[INST] <<SYS>>\n";
  const newConversation = "End of example chat, the events  of the previous messages never happened.";
  const newExample = "New example chat, use the example messages as a style and character personality guide.";
  const context = "";
  const contextResponse = ``;
  const replyAttributes = (impersonation) =>
    impersonation ? "" : " (2-4 paragraphs)";
  const characterBias = replaceTemplates(config.characterBias, config);
  const impersonationPrompt = replaceTemplates(
    config.impersonationPrompt,
    config
  );
  const silentMessage = replaceTemplates(config.silentMessage, config);

  addStoppingStrings(config, ["<<SYS>>","<</SYS>>", "[INST]", "[Inst]", "[/Inst]", "[/INST]", "{{user}}:", "{{char}}:", "\n{{char}}:"]);
  let impersonationPromptFound = false;
  let extensionPrompt = null;

  const userName = (attributes = "") =>
    `${user}:`;
  const assistantName = (attributes = "") =>
    `${assistant}:`;

  const beforeSystem = " <<SYS>>\n";
  const afterSystem = "\n<</SYS>> ";
  const beforeUser = "[INST] ";
  const afterUser = " ";
  const beforeAssistant = "[/INST] ";
  const afterAssistant = " ";


  const addReplyInstruction = true; 
  const replyInstruction = ({
    you,
    other,
  }) => ``;


  let prompt = [];
  if (systemPrompt) {
    prompt.push({
      role: "system",
      metadata: { type: "system-prompt" },
      prunable: false,
      content: `${systemPrompt}`,
    });
  }

  for (const msg of messages) {
    const { metadata } = msg;
    let content = msg.content.trim();

    if (metadata.type === "new-conversation") {
      if (newConversation) {
        prompt.push({
          ...msg,
          prunable: false,
          content: `${beforeSystem}${newConversation}${afterSystem}`,
        });
      }
    } else if (metadata.type === "new-example-dialogue") {
      if (newExample && metadata.chatIndex === 0) {
        prompt.push({
          ...msg,
          prunable: false,
          content: `${beforeSystem}${newExample}${afterSystem}`,
        });
      }
    } else if (metadata.type === "context") {
      prompt.push({
        ...msg,
        prunable: false,
        content: `${context}${content}${afterSystem}`,
      });
      if (contextResponse) {
        prompt.push({
          role: "assistant",
          metadata: { type: "context-response" },
          prunable: false,
          content: `${beforeAssistant}${contextResponse}${afterAssistant}`,
        });
      }
    } else if (metadata.type === "example-assistant") {
      const keepFirst =
        config.alwaysKeepFirstAssistantExample &&
        metadata.exampleAssistantMsgIndex === 0;
      prompt.push({
        ...msg,
        prunable: !(config.keepExampleMessagesInPrompt || keepFirst),
        content: `${beforeAssistant}${assistantName({
          isExample: true,
        })} ${content}${afterAssistant}`,
      });
    } else if (metadata.type === "example-user") {
      prompt.push({
        ...msg,
        prunable: !config.keepExampleMessagesInPrompt,
        content: `${beforeUser}${userName({
          isExample: true,
        })} ${content}${afterUser}`,
      });
    } else if (metadata.type === "other" || metadata.type === "jailbreak") {
      prompt.push({
        ...msg,
        prunable: false,
        content: `${beforeSystem}${content}${afterSystem}`,
      });
    } else if (metadata.type === "impersonation-prompt") {
      impersonationPromptFound = true;
    } else if (metadata.type === "extension-prompt") {
      extensionPrompt = {
        ...msg,
        prunable: false,
        content: `${beforeSystem}${content}${afterSystem}`,
      };
    } else if (metadata.type === "assistant-msg") {
      prompt.push({
        ...msg,
        prunable: true,
        content: `${beforeAssistant}${assistantName()} ${content}${afterAssistant}`,
      });
    } else if (metadata.type === "user-msg") {
      prompt.push({
        ...msg,
        prunable: true,
        content: `${beforeUser}${userName()} ${content}${afterUser}`,
      });
    }
  }

  const last = getLastChatMessage(prompt);
  const lastMessages = popLastChatMessages(prompt, 2);

  const you = impersonationPromptFound ? user : assistant;
  const other = impersonationPromptFound ? assistant : user;

  if (addReplyInstruction) {
    prompt.push({
      role: "system",
      metadata: { type: "reply-instruction" },
      prunable: false,
      content: replyInstruction({ you, other }),
    });
  }

  for (const msg of lastMessages) {
    prompt.push(msg);
  }

  if (impersonationPromptFound || last?.role === "user" || silentMessage) {
    if (last?.role === "assistant" && silentMessage) {
      prompt.push({
        role: "user",
        metadata: { type: "silent-message" },
        prunable: false,
        content: `${beforeUser}${userName()}${silentMessage}${afterUser}`,
      });
    }

    if (impersonationPromptFound) {
      prompt.push({
        role: "system",
        metadata: { type: "impersonation-prompt" },
        prunable: false,
        content: `${beforeSystem}${impersonationPrompt}${afterSystem}`,
      });
    }
  } else {
    const msg = popLastAssistantMessage(prompt);
    const end = msg.content.length - afterAssistant.length;
    msg.content = msg.content.substring(0, end);
    prompt.push(msg);
  }

  const before = impersonationPromptFound ? beforeUser : beforeAssistant;
  const name = impersonationPromptFound ? userName : assistantName;
  const role = impersonationPromptFound ? "user" : "assistant";
  const attr = replyAttributes(impersonationPromptFound);
  prompt.push({
    role,
    metadata: { type: "reply-to-complete" },
    prunable: false,
    content: `${before}${name({ attr })}${characterBias}`,
  });

  prompt.splice(prompt.length - 5, 0, {
    role: "system",
    metadata: { type: "superbig-injection-point" },
    prunable: true,
    content: "",
  });

  if (impersonationPromptFound) {
    generationConfig.max_new_tokens = config.impersonationMaxNewTokens;
  }

  if (extensionPrompt) {
    prompt.push(extensionPrompt);
  }

  return prompt;
};
