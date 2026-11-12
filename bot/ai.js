// Professional AI Bot Engine for ProChat
// Powered by Groq Ultra-Fast LPU Inference with Friendly Malayalam Persona & Dynamic Specialist Generation

const BOT_USER = {
  username: 'probot',
  password: 'probot_secure_system_password_2026',
  display_name: 'ProBot AI',
  profession: 'AI Consultant & Knowledge Assistant',
  skills: 'Malayalam, Technology, Business, Career Guidance, Problem Solving',
  bio: '24/7 AI Professional Assistant powered by Groq. Message me directly in Malayalam, Manglish, or English!'
};

const KERALA_FIRST_NAMES = [
  'Rahul', 'Priya', 'Anand', 'Deepa', 'Sujith', 'Kavitha', 'Arjun', 'Reshma',
  'Vishnu', 'Anjali', 'Nikhil', 'Sneha', 'Midhun', 'Divya', 'Anoop', 'Lakshmi'
];

const KERALA_LAST_NAMES = [
  'Nair', 'Menon', 'Varma', 'Pillai', 'Nambiar', 'Kurian', 'Thomas', 'Joseph',
  'Mathew', 'Varghese', 'Ahmed', 'Ali', 'Ibrahim', 'Panicker', 'Rao'
];

function makeUsername(name, profession) {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const cleanProf = profession.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const randNum = Math.floor(100 + Math.random() * 900);
  return `${cleanName}_${cleanProf}_${randNum}`.slice(0, 28);
}

// Retrieve configured Groq API keys with automatic fallback rotation
function getApiKeys() {
  const keys = [];
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY.trim());
  if (process.env.GROQ_API_KEY_FALLBACK) keys.push(process.env.GROQ_API_KEY_FALLBACK.trim());
  if (process.env.GROQ_API_KEYS) {
    process.env.GROQ_API_KEYS.split(',').forEach(k => {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    });
  }
  return keys;
}

// Universal Groq Chat Caller with key rotation and model fallback
async function callGroqChat({ messages, temperature = 0.7, max_tokens = 750 }) {
  const keys = getApiKeys();
  const models = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];

  if (keys.length === 0) return null;

  for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
    const apiKey = keys[keyIdx];
    for (const model of models) {
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
            temperature,
            max_tokens
          })
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content;
          if (text && text.trim()) {
            return text.trim();
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData?.error?.message || '';
          console.warn(`Groq Key #${keyIdx + 1} (${model}) status ${res.status}:`, errMsg);

          // If rate limited, immediately break model loop to switch to next key
          if (res.status === 429 || errMsg.includes('rate_limit') || errMsg.includes('tokens per day')) {
            console.warn(`⚠️ Groq Key #${keyIdx + 1} rate limit reached! Switching to next API key immediately...`);
            break;
          }
        }
      } catch (err) {
        console.warn(`Groq request error on key #${keyIdx + 1}:`, err.message);
      }
    }
  }
  return null;
}

// Generate realistic professional persona dynamically
async function generateSpecialistPersona(professionQuery) {
  const target = (professionQuery || '').trim();

  if (target) {
    try {
      const prompt = `You are a professional profile generator for a networking app in Kerala, India.
Generate a realistic, professional human profile for someone who is a "${target}".
Return ONLY a valid JSON object (no markdown, no extra text) with these exact keys:
{
  "display_name": "Full Name (e.g. Dr. Anand Varma, Adv. Priya Menon, Arjun Nair, etc. include Dr. or Adv. only if doctor or lawyer)",
  "profession": "Accurate Professional Title (e.g. Senior Business Consultant, Cardiologist, High Court Advocate, etc.)",
  "skills": "4-5 comma separated key domain skills",
  "bio": "Warm, encouraging 2-sentence background from Kerala, enthusiastic to guide and mentor people."
}`;

      const rawContent = await callGroqChat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 300
      });

      if (rawContent) {
        let raw = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(raw);
        if (parsed.display_name && parsed.profession) {
          const username = makeUsername(parsed.display_name, parsed.profession);
          return {
            display_name: parsed.display_name.trim(),
            username,
            password: 'password', // will hash with 123456
            profession: parsed.profession.trim(),
            skills: (parsed.skills || target).trim(),
            bio: (parsed.bio || `Specialist in ${target}. Always ready to guide and talk.`).trim() + ' [AI Professional]'
          };
        }
      }
    } catch (e) {
      console.warn('Groq dynamic persona generation fallback triggered:', e.message);
    }
  }

  // Fallback realistic generator if Groq is busy
  const fn = KERALA_FIRST_NAMES[Math.floor(Math.random() * KERALA_FIRST_NAMES.length)];
  const ln = KERALA_LAST_NAMES[Math.floor(Math.random() * KERALA_LAST_NAMES.length)];
  const isDoctor = /doctor|cardio|pediatr|medic|physician/i.test(target);
  const isLawyer = /lawyer|advocate|legal|attorney/i.test(target);

  let prefix = '';
  if (isDoctor) prefix = 'Dr. ';
  else if (isLawyer) prefix = 'Adv. ';

  const display_name = `${prefix}${fn} ${ln}`;
  const capitalizedProf = target.charAt(0).toUpperCase() + target.slice(1);
  const username = makeUsername(display_name, target);

  return {
    display_name,
    username,
    password: 'password', // will hash with 123456
    profession: `${capitalizedProf} Specialist`,
    skills: `${capitalizedProf}, Consulting, Strategy, Mentorship`,
    bio: `Experienced ${capitalizedProf} from Kerala. Always happy to guide, talk, and explain in detail! [AI Professional]`
  };
}

// Friendly system prompt with high readiness to explain and guide
function buildPersonaPrompt(botProfile, userName, userProfession) {
  return `You are "${botProfile.display_name}", a real human professional specialist in the ProChat network from Kerala, India.
Your Professional Role: "${botProfile.profession}".
Your Key Skills: "${botProfile.skills || 'Domain Knowledge'}".
Your Background: "${botProfile.bio}".
User chatting with you: ${userName} (${userProfession || 'Friend / Professional'}).

CRITICAL RULES - FOLLOW STRICTLY:
1. Act 100% authentically as a real human ${botProfile.profession}. NEVER say you are an AI, bot, language model, robot, or from OpenAI/Groq. You are ${botProfile.display_name} in person.
2. TONE IS EXTREMELY WARM, FRIENDLY, AND SUPPORTIVE (വളരെ ഫ്രണ്ട്‌ലിയായി, സ്നേഹത്തോടെയും കാര്യങ്ങൾ വിശദമായി പറഞ്ഞുതരാൻ എപ്പോഴും തയ്യാറുള്ള ഒരു ചേട്ടനെപ്പോലെയോ മെന്ററെപ്പോലെയോ സംസാരിക്കുക).
3. ALWAYS reply in natural Malayalam language (Malayalam script). Technical terms and names stay in English inside Malayalam sentences (e.g. "GST രജിസ്ട്രേഷൻ", "Market Research", "Instagram Marketing").
4. READINESS TO EXPLAIN MORE: Always be eager to explain in detail. Give practical, step-by-step guidance.
5. END WITH A WARM INVITATION: Conclude your answers warmly inviting more questions or offering the next step (e.g., "ഇതിനെക്കുറിച്ച് കൂടുതൽ അറിയാൻ താല്പര്യമുണ്ടോ? ഞാൻ വിശദമായി പറഞ്ഞുതരാം കേട്ടോ! 😊", "ഇതിന്റെ അടുത്ത സ്റ്റെപ്പ് എന്താണെന്ന് പറഞ്ഞു തരട്ടെ?", "എന്ത് സംശയമുണ്ടെങ്കിലും ധൈര്യമായി ചോദിക്കൂ, ഞാൻ ഇവിടെയുണ്ട്!").
6. Formatting: Use clean bullet points or numbers for readability, like a friendly WhatsApp chat.`;
}

// Detect if user is asking about someone or asking to contact someone
async function detectInquiryIntent(userMessage) {
  const apiKey = process.env.GROQ_API_KEY;
  const msg = (userMessage || '').trim();
  if (!msg) return { is_inquiry: false };

  const cleaned = msg.replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Direct Regex Checks for "Do you know X" / "Did you know X" / "X-ne ariyumo"
  const knowMatch1 = cleaned.match(/(?:did\s+you\s+know|do\s+you\s+know|know\s+about)\s+([A-Za-z0-9_]+)/i);
  const knowMatch2 = cleaned.match(/^([A-Za-z0-9_]+)(?:-?ne|-?ine|-?e)?\s+(?:ariyumo|ariyo|know)/i);
  const knowMatch3 = cleaned.match(/(?:ariyumo|ariyo)\s+([A-Za-z0-9_]+)/i);

  if (knowMatch1 || knowMatch2 || knowMatch3) {
    const target = (knowMatch1?.[1] || knowMatch2?.[1] || knowMatch3?.[1]).trim();
    if (target && target.length > 1 && !['this', 'that', 'what', 'how', 'me', 'you'].includes(target.toLowerCase())) {
      return {
        is_inquiry: true,
        type: 'check_knows',
        target_name: target,
        question: msg
      };
    }
  }

  // 2. Direct Regex Checks for "X ippol enth cheyyunnu", "X enth cheyyunnu", "ask X", "X-nod chodikkamo"
  const inquireMatch1 = cleaned.match(/^([A-Za-z0-9_]+)(?:-?nod|-?odu|-?node)?\s*(?:ippol|now)?\s*(?:enth|entha|enthanu)\s*(?:cheyyunnu|cheyyunnath|doing)/i);
  const inquireMatch2 = cleaned.match(/(?:ask|chodikk|chodikkamo|chodikko|chothikkamo|contact|message)\s+([A-Za-z0-9_]+)/i);
  const inquireMatch3 = cleaned.match(/^([A-Za-z0-9_]+)(?:-?nod|-?odu|-?node)\s*(?:onnu\s*)?(?:chodikk|chodikkamo|chodikko|chothikk)/i);
  const inquireMatch4 = cleaned.match(/^([A-Za-z0-9_]+)\s+(?:evide|eppo|aano|enth)/i);

  if (inquireMatch1 || inquireMatch2 || inquireMatch3 || inquireMatch4) {
    const target = (inquireMatch1?.[1] || inquireMatch2?.[1] || inquireMatch3?.[1] || inquireMatch4?.[1]).trim();
    if (target && target.length > 1 && !['this', 'that', 'what', 'how', 'me', 'you'].includes(target.toLowerCase())) {
      return {
        is_inquiry: true,
        type: 'inquire_ask',
        target_name: target,
        question: msg
      };
    }
  }

  // 3. Fallback to Groq AI LLM parsing using rotating API keys
  try {
    const prompt = `Analyze this chat message: "${msg}"
The user might be talking to an assistant in a social networking app.
Determine:
1. Is user asking if the assistant knows another person? (e.g. "did you know sabu", "do you know Priya", "sabu-ne ariyumo") -> type: "check_knows"
2. Is user asking the assistant to contact, ask, check on someone, or asking what someone is doing? (e.g. "sabu ippol enth cheyyunnu", "ask Rahul", "Priya-yodu chodikkamo") -> type: "inquire_ask"
3. Neither (general chat or not about a 3rd person) -> is_inquiry: false

Return ONLY JSON:
{
  "is_inquiry": true or false,
  "type": "check_knows" or "inquire_ask",
  "target_name": "clean name of person (e.g. Sabu, Priya, Rahul), or empty",
  "question": "summary of question"
}`;

    const raw = await callGroqChat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 150
    });

    if (raw) {
      let cleanedJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);
      if (parsed && parsed.is_inquiry && parsed.target_name) {
        return {
          is_inquiry: true,
          type: parsed.type || 'inquire_ask',
          target_name: parsed.target_name.trim(),
          question: (parsed.question || msg).trim()
        };
      }
    }
  } catch (e) {
    // ignore
  }

  return { is_inquiry: false };
}

// Generate response for any persona (ProBot or dynamic specialist)
async function generateBotReply({
  botProfile = BOT_USER,
  userMessage,
  userName = 'User',
  userProfession = 'Professional',
  conversationHistory = []
}) {
  try {
    const systemPrompt = buildPersonaPrompt(botProfile, userName, userProfession);

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    for (const m of conversationHistory.slice(-6)) {
      messages.push({
        role: m.sender_id === botProfile.id || m.sender_username === botProfile.username ? 'assistant' : 'user',
        content: m.content
      });
    }

    messages.push({
      role: 'user',
      content: userMessage
    });

    const text = await callGroqChat({
      messages,
      temperature: 0.7,
      max_tokens: 750
    });

    if (text && text.trim()) {
      return text.trim();
    }
  } catch (err) {
    console.error('Error in Groq persona reply:', err.message);
  }

  // Friendly Fallback response
  return `ഹലോ ${userName}! 😊 ഞാൻ ${botProfile.display_name} ആണ് (${botProfile.profession}). നിങ്ങളുടെ മെസ്സേജ് കണ്ടതിൽ വളരെ സന്തോഷം! ഇതിനെക്കുറിച്ച് കൂടുതൽ കാര്യങ്ങൾ ഞാൻ വിശദമായി പറഞ്ഞുതരാൻ തയ്യാറാണ്. നിങ്ങൾക്ക് കൃത്യമായി എന്താണ് അറിയേണ്ടത് എന്ന് ചോദിക്കൂ, ഞാൻ പറഞ്ഞുതരാം! 👍`;
}

module.exports = {
  BOT_USER,
  generateSpecialistPersona,
  generateBotReply,
  detectInquiryIntent
};
