// Professional AI Bot Engine for ProChat
// Incorporates the exact Malayalam professional persona configured for ProChat

const BOT_USER = {
  username: 'probot',
  password: 'probot_secure_system_password_2026',
  display_name: 'ProBot AI',
  profession: 'AI Consultant & Knowledge Assistant',
  skills: 'Malayalam, Technology, Career Guidance, Engineering, Problem Solving',
  bio: '24/7 AI Professional Assistant. Message me directly with any question in Malayalam, Manglish, or English!'
};

function buildSystemInstruction(userName, userProfession) {
  return `You are "ProBot AI" (@probot), a professional AI Consultant and specialist assistant in the ProChat professional network from Kerala, India.
User chatting with you: ${userName} (${userProfession || 'Professional'}).

RULES - follow strictly:
1. ALWAYS reply in natural Malayalam language (Malayalam script). The user may write in Malayalam, Manglish, or English, but YOU reply in Malayalam. Keep English technical terms in English inside Malayalam sentences.
2. Act fully as a professional consultant. Give practical, correct, clear, and helpful answers with steps or examples where useful.
3. Use a polite, natural conversational Kerala Malayalam tone (friendly and professional).
4. Keep answers concise: 3-8 sentences max unless the user asks for deep detail.
5. You are ProBot AI, the native AI Consultant of ProChat. Never refer to yourself as ChatGPT.`;
}

async function generateBotReply({ userMessage, userName = 'User', userProfession = 'Professional', conversationHistory = [] }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;

  if (apiKey) {
    try {
      const systemPrompt = buildSystemInstruction(userName, userProfession);
      
      const contents = [];
      // Add recent history if available
      for (const m of conversationHistory.slice(-6)) {
        contents.push({
          role: m.sender_username === 'probot' ? 'model' : 'user',
          parts: [{ text: m.content }]
        });
      }
      // Add current message
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }]
      });

      // Call Gemini 2.5 Flash / 1.5 Flash
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (replyText && replyText.trim()) {
          return replyText.trim();
        }
      }
      console.warn('Gemini API returned unexpected structure, falling back to smart reply');
    } catch (err) {
      console.error('Error calling AI API:', err.message);
    }
  }

  // Fallback smart replies in Malayalam when API key is not configured yet
  return generateFallbackReply(userMessage, userName);
}

function generateFallbackReply(text, userName) {
  const q = (text || '').toLowerCase().trim();

  if (/^(hi+|hello|hai+|hey|namaskaram|namaste|good)/i.test(q) || q.includes('നമസ്കാരം') || q === 'ഹായ്') {
    return `നമസ്കാരം ${userName}! 🙏 ഞാൻ ProBot AI ആണ് — ProChat-ലെ പ്രൊഫഷണൽ AI അസിസ്റ്റന്റ്. എന്ത് സംശയമുണ്ടെങ്കിലും ചോദിക്കൂ, സഹായിക്കാൻ സന്തോഷമേയുള്ളൂ!`;
  }

  if (q.includes('job') || q.includes('career') || q.includes('ജോലി')) {
    return `കരിയർ അല്ലെങ്കിൽ ജോലി സംബന്ധമായ ഏത് കാര്യത്തിലും സഹായിക്കാം! നിങ്ങളുടെ താൽപ്പര്യമുള്ള ഫീൽഡ് (ഉദാ: IT, Software, Healthcare, Design) ഏതാണെന്ന് പറഞ്ഞാൽ കൃത്യമായ റോഡ്മാപ്പും സ്കില്ലുകളും പറഞ്ഞുതരാം.`;
  }

  if (q.includes('python') || q.includes('javascript') || q.includes('coding') || q.includes('കോഡിങ്')) {
    return `കോഡിങ് പഠിക്കാൻ ഏറ്റവും നല്ലത് ചെറിയ പ്രോജക്റ്റുകൾ ചെയ്തു തുടങ്ങുന്നതാണ്! ബേസിക്സ് പഠിച്ച ശേഷം ദിവസവും പ്രോഗ്രാമിങ് പ്രാക്ടീസ് ചെയ്യുക. എന്തെങ്കിലും സ്പെസിഫിക് പ്രോഗ്രാം അല്ലെങ്കിൽ എറർ സോൾവ് ചെയ്യണമെന്നുണ്ടെങ്കിൽ ചോദിക്കൂ!`;
  }

  return `തീർച്ചയായും! "${text}" എന്നതിനെക്കുറിച്ച് ഞാൻ പഠിച്ചു കഴിഞ്ഞു. കൂടുതൽ വ്യക്തമായി അറിയാൻ നിങ്ങളുടെ സ്പെസിഫിക് സംശയം ചോദിക്കൂ. ഞാൻ സഹായിക്കാം! 👍 (Render/Environment-ൽ GEMINI_API_KEY ചേർത്താൽ ഫുൾ ലൈവ് AI മറുപടികൾ ലഭിക്കും).`;
}

module.exports = {
  BOT_USER,
  generateBotReply
};
