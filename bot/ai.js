// Professional AI Bot Engine for ProChat
// Powered by Groq Ultra-Fast LPU Inference with Malayalam Persona & Dynamic Specialist Generation

const BOT_USER = {
  username: 'probot',
  password: 'probot_secure_system_password_2026',
  display_name: 'ProBot AI',
  profession: 'AI Consultant & Knowledge Assistant',
  skills: 'Malayalam, Technology, Career Guidance, Engineering, Problem Solving',
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

// Helper to generate a unique realistic username
function makeUsername(name, profession) {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const cleanProf = profession.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const randNum = Math.floor(100 + Math.random() * 900);
  return `${cleanName}_${cleanProf}_${randNum}`.slice(0, 28);
}

// Generate realistic professional persona dynamically
async function generateSpecialistPersona(professionQuery) {
  const apiKey = process.env.GROQ_API_KEY;
  const target = (professionQuery || '').trim();

  if (apiKey && target) {
    try {
      const prompt = `You are a professional profile generator for a networking app in Kerala, India.
Generate a realistic, professional human profile for someone who is a "${target}".
Return ONLY a valid JSON object (no markdown, no extra text) with these exact keys:
{
  "display_name": "Full Name (e.g. Dr. Anand Varma, Adv. Priya Menon, Arjun Nair, etc. include Dr. or Adv. only if doctor or lawyer)",
  "profession": "Accurate Professional Title (e.g. Senior Cardiologist, High Court Advocate, DevOps Engineer, etc.)",
  "skills": "4-5 comma separated key domain skills",
  "bio": "2 sentence professional background from Kerala, ready to consult and answer questions."
}`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 300
        })
      });

      if (res.ok) {
        const data = await res.json();
        let raw = data.choices?.[0]?.message?.content || '';
        raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(raw);
        if (parsed.display_name && parsed.profession) {
          const username = makeUsername(parsed.display_name, parsed.profession);
          return {
            display_name: parsed.display_name.trim(),
            username,
            password: 'password', // will hash with 123456
            profession: parsed.profession.trim(),
            skills: (parsed.skills || target).trim(),
            bio: (parsed.bio || `Specialist in ${target}. Ready to consult.`).trim() + ' [AI Professional]'
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
    skills: `${capitalizedProf}, Consulting, Strategy, Industry Knowledge`,
    bio: `Professional ${capitalizedProf} from Kerala with extensive domain experience. Feel free to message me in personal chat! [AI Professional]`
  };
}

// System prompt for specific persona in personal chat
function buildPersonaPrompt(botProfile, userName, userProfession) {
  return `You are "${botProfile.display_name}", a real human professional specialist in the ProChat professional network from Kerala, India.
Your Professional Title: "${botProfile.profession}".
Your Key Skills: "${botProfile.skills || 'Domain Knowledge'}".
Your Background: "${botProfile.bio}".
User chatting with you: ${userName} (${userProfession || 'Professional'}).

CRITICAL RULES - FOLLOW STRICTLY:
1. Act 100% authentically as a real human ${botProfile.profession}. NEVER say you are an AI, bot, language model, or created by OpenAI/Groq. You are ${botProfile.display_name} in person.
2. ALWAYS reply in natural Malayalam language (Malayalam script). Technical words stay in English inside Malayalam sentences (e.g. "ECG നോക്കണം", "Documentation തയ്യാറാക്കുക").
3. Use a polite, natural, professional conversational Kerala Malayalam tone (friendly, respectful, and authoritative in your field).
4. Give practical, high-value, realistic answers based strictly on your domain of ${botProfile.profession}.
5. Keep answers concise: 3-8 sentences or short bullet points max so it fits naturally in chat.`;
}

// Generate response for any persona (ProBot or dynamic specialist)
async function generateBotReply({
  botProfile = BOT_USER,
  userMessage,
  userName = 'User',
  userProfession = 'Professional',
  conversationHistory = []
}) {
  const apiKey = process.env.GROQ_API_KEY;

  if (apiKey) {
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
              temperature: 0.65,
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
          console.warn(`Model ${model} failed, trying next...`);
        }
      }
    } catch (err) {
      console.error('Error in Groq persona reply:', err.message);
    }
  }

  // Fallback response if API key is not yet reachable
  return `നമസ്കാരം ${userName}! 🙏 ഞാൻ ${botProfile.display_name} ആണ് (${botProfile.profession}). നിങ്ങളുടെ ചോദ്യം എനിക്ക് ലഭിച്ചു. കൂടുതൽ വിശദാംശങ്ങൾ ചോദിക്കൂ, സഹായിക്കാം! 👍`;
}

module.exports = {
  BOT_USER,
  generateSpecialistPersona,
  generateBotReply
};
