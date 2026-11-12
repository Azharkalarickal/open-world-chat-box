// Professional AI Bot Engine for ProChat
// Powered by Groq Ultra-Fast LPU Inference with Malayalam Persona

const BOT_USER = {
  username: 'probot',
  password: 'probot_secure_system_password_2026',
  display_name: 'ProBot AI',
  profession: 'AI Consultant & Knowledge Assistant',
  skills: 'Malayalam, Technology, Career Guidance, Engineering, Problem Solving',
  bio: '24/7 AI Professional Assistant powered by Groq. Message me directly in Malayalam, Manglish, or English!'
};

function buildSystemInstruction(userName, userProfession) {
  return `You are "ProBot AI" (@probot), a professional AI Consultant and specialist in the ProChat professional network from Kerala, India.
User chatting with you: ${userName} (${userProfession || 'Professional'}).

RULES - FOLLOW STRICTLY:
1. ALWAYS reply in natural Malayalam language (Malayalam script). The user may write in Malayalam, Manglish, or English, but YOU reply in Malayalam. Keep English technical terms in English inside Malayalam sentences (e.g. "Python ഇൻസ്റ്റാൾ ചെയ്യുക", "API കണക്ട് ചെയ്യുക").
2. Act fully as a professional consultant. Give practical, correct, clear, and helpful answers with steps or examples where useful.
3. Use a polite, natural conversational Kerala Malayalam tone (friendly, respectful, and professional).
4. Keep answers concise: 3-8 sentences or short bullet points max so it fits naturally in chat.
5. You are ProBot AI, the native AI Consultant of ProChat. Never say you are ChatGPT or OpenAI.`;
}

async function generateBotReply({ userMessage, userName = 'User', userProfession = 'Professional', conversationHistory = [] }) {
  const apiKey = process.env.GROQ_API_KEY;

  if (apiKey) {
    try {
      const systemPrompt = buildSystemInstruction(userName, userProfession);

      const messages = [
        { role: 'system', content: systemPrompt }
      ];

      // Add recent history if available
      for (const m of conversationHistory.slice(-6)) {
        messages.push({
          role: m.sender_username === 'probot' ? 'assistant' : 'user',
          content: m.content
        });
      }

      // Add current message
      messages.push({
        role: 'user',
        content: userMessage
      });

      // Try Groq models (qwen3.8-27b or openai/gpt-oss-120b)
      const modelsToTry = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

      for (const model of modelsToTry) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.6,
              max_tokens: 600
            })
          });

          if (res.ok) {
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content;
            if (text && text.trim()) {
              return text.trim();
            }
          }
        } catch (innerErr) {
          console.warn(`Groq model ${model} failed, trying next...`);
        }
      }
    } catch (err) {
      console.error('Error calling Groq API:', err.message);
    }
  }

  // Fallback smart replies in Malayalam
  return generateFallbackReply(userMessage, userName);
}

function generateFallbackReply(text, userName) {
  const q = (text || '').toLowerCase().trim();

  if (/^(hi+|hello|hai+|hey|namaskaram|namaste|good)/i.test(q) || q.includes('നമസ്കാരം') || q === 'ഹായ്') {
    return `നമസ്കാരം ${userName}! 🙏 ഞാൻ ProBot AI ആണ് — ProChat-ലെ പ്രൊഫഷണൽ AI അസിസ്റ്റന്റ്. എന്ത് സംശയമുണ്ടെങ്കിലും ചോദിക്കൂ, സഹായിക്കാൻ സന്തോഷമേയുള്ളൂ!`;
  }

  return `തീർച്ചയായും! ${userName}, നിങ്ങളുടെ ചോദ്യത്തിന് മറുപടി നൽകാൻ ഞാൻ ഇവിടെയുണ്ട്. എന്ത് സംശയമുണ്ടെങ്കിലും വ്യക്തമായി ചോദിക്കൂ, സഹായിക്കാം! 👍`;
}

module.exports = {
  BOT_USER,
  generateBotReply
};
