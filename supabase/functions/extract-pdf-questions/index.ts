import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ORIGIN") || "https://jeenie.website",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ====================================================================
//  📄 PDF QUESTION EXTRACTION v3.0
//  Chain: Lovable AI Gateway → Gemini Vision → Claude Vision → OpenAI Vision
// ====================================================================

interface ExtractedQuestion {
  question_number: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string;
  subject: string;
  chapter: string;
  topic: string;
  difficulty: string;
  has_image: boolean;
}

interface DatabaseChapter { id: string; chapter_name: string; subject: string; }
interface DatabaseTopic { id: string; topic_name: string; chapter_id: string; }

function normalizeMatchText(value: string): string {
  return (value || '').toLowerCase().trim().replace(/&/g, 'and').replace(/\s+/g, ' ');
}

function findBestChapterMatch(extractedChapter: string, subject: string, dbChapters: DatabaseChapter[]): DatabaseChapter | null {
  if (!extractedChapter || !subject) return null;
  const relevant = dbChapters.filter(ch => ch.subject === subject);
  const norm = normalizeMatchText(extractedChapter);
  for (const ch of relevant) { if (normalizeMatchText(ch.chapter_name) === norm) return ch; }
  for (const ch of relevant) {
    const n = normalizeMatchText(ch.chapter_name);
    const words1 = norm.split(/\s+/).filter(w => w.length > 2);
    const words2 = n.split(/\s+/).filter(w => w.length > 2);
    if (!words1.length || !words2.length) continue;
    const overlap = words1.filter(w => words2.some(c => c.includes(w) || w.includes(c))).length;
    if (overlap / Math.max(words1.length, words2.length, 1) >= 0.25) return ch;
  }
  return null;
}

function findBestTopicMatch(extractedTopic: string, chapterId: string, dbTopics: DatabaseTopic[]): DatabaseTopic | null {
  if (!extractedTopic || !chapterId) return null;
  const relevant = dbTopics.filter(t => t.chapter_id === chapterId);
  const norm = normalizeMatchText(extractedTopic);
  for (const t of relevant) { if (normalizeMatchText(t.topic_name) === norm) return t; }
  for (const t of relevant) {
    const n = normalizeMatchText(t.topic_name);
    const words1 = norm.split(/\s+/).filter(w => w.length > 2);
    const words2 = n.split(/\s+/).filter(w => w.length > 2);
    if (!words1.length || !words2.length) continue;
    const overlap = words1.filter(w => words2.some(c => c.includes(w) || w.includes(c))).length;
    if (overlap / Math.max(words1.length, words2.length, 1) >= 0.25) return t;
  }
  return null;
}

function determineDifficulty(question: string, options: string[]): string {
  const text = (question + options.join(' ')).toLowerCase();
  const hard = ['derive','prove','integration','differential equation','complex','jee advanced','assertion','matrix','determinant','limit','calculus','electromagnetic','quantum','mechanism'];
  const easy = ['define','what is','name the','identify','basic','simple','which of the following','fill in','true or false','ncert','fundamental'];
  const hc = hard.filter(h => text.includes(h)).length;
  const ec = easy.filter(e => text.includes(e)).length;
  const wc = question.split(/\s+/).length;
  if (hc >= 2 || wc > 80) return "Hard";
  if (ec >= 2 || wc < 20) return "Easy";
  return "Medium";
}

// --- Vision API calls ---

async function callLovableAIVision(imageBase64: string, prompt: string, mimeType: string): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;
  try {
    console.log("[ADMIN] 🔄 PDF: Trying Lovable AI Gateway (google/gemini-2.5-flash)...");
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${cleanBase64}` } }
          ]
        }],
        max_tokens: 16000,
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      const errText = (await res.text()).substring(0, 300);
      console.error("[ADMIN] ❌ Lovable AI Vision:", res.status, errText);
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (text) { console.log("[ADMIN] ✅ Lovable AI Vision success"); return text; }
    return null;
  } catch (e) { console.error("[ADMIN] ❌ Lovable AI Vision error:", e); return null; }
}

async function callGeminiVision(imageBase64: string, prompt: string, apiKey: string, mimeType: string): Promise<string | null> {
  try {
    console.log("[ADMIN] 🔄 PDF: Trying Gemini Vision (fallback)...");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64.replace(/^data:image\/\w+;base64,/, "") } }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 16000, topP: 0.8 },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
        }),
      }
    );
    if (!res.ok) { console.error("[ADMIN] ❌ Gemini Vision:", res.status, (await res.text()).substring(0, 200)); return null; }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { console.error("[ADMIN] ❌ Gemini Vision error:", e); return null; }
}

async function callClaudeVision(imageBase64: string, prompt: string, apiKey: string, mimeType: string): Promise<string | null> {
  try {
    console.log("[ADMIN] 🔄 PDF: Trying Claude Vision (fallback)...");
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022", max_tokens: 8000,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: cleanBase64 } },
          { type: "text", text: prompt }
        ]}],
      }),
    });
    if (!res.ok) { console.error("[ADMIN] ❌ Claude Vision:", res.status, (await res.text()).substring(0, 200)); return null; }
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch (e) { console.error("[ADMIN] ❌ Claude Vision error:", e); return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: "Login required hai boss! 🔒" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: "Session expire ho gayi! Dobara login karo 🔑" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const { data: roleData } = await supabaseClient
      .from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]).limit(1).maybeSingle();
    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, message: "Admin access chahiye! 🛡️" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const { data: dbChapters } = await supabaseClient.from("chapters").select("id, chapter_name, subject");
    const { data: dbTopics } = await supabaseClient.from("topics").select("id, topic_name, chapter_id");

    if (!dbChapters || !dbTopics) {
      return new Response(
        JSON.stringify({ success: false, message: "Database se curriculum load nahi hua! 📚 Thoda baad try karo." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const { imageBase64, sourceFile, pageNumber, subject, chapter, chapterId, exam } = await req.json();
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ success: false, message: "Image nahi mili! 📸 PDF page upload karo." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`[ADMIN] 📄 Processing page ${pageNumber} from ${sourceFile}`);

    const chapterList = subject
      ? dbChapters.filter(ch => ch.subject === subject).map(ch => ch.chapter_name).join(', ')
      : dbChapters.map(ch => `${ch.subject}: ${ch.chapter_name}`).join('; ');

    const extractionPrompt = `Extract ALL questions from this textbook/question paper page. Return ONLY valid JSON.

RULES:
- Extract EVERY question including sub-questions
- Use LaTeX for math: $\\frac{a}{b}$, $\\alpha$, $\\int$, $\\sqrt{x}$
- ${subject ? `Subject: ${subject}` : 'Detect subject from content'}
- Map chapters to: ${chapterList}
${chapter ? `- Chapter hint: ${chapter}` : ''}
${exam ? `- Exam: ${exam}` : ''}

Return format:
{
  "questions": [
    {
      "question_number": "1",
      "question": "Question text with $LaTeX$",
      "option_a": "A", "option_b": "B", "option_c": "C", "option_d": "D",
      "correct_option": "A",
      "explanation": "Brief explanation",
      "subject": "Physics",
      "chapter": "Chapter name from list",
      "topic": "Specific topic",
      "difficulty": "Easy|Medium|Hard",
      "has_image": false
    }
  ],
  "total_questions_on_page": 5,
  "page_type": "question"
}

If no questions: {"questions": [], "page_type": "non-question", "total_questions_on_page": 0}`;

    const detectedMime = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    let responseText: string | null = null;

    // 1️⃣ Lovable AI Gateway (PRIMARY - no quota issues)
    responseText = await callLovableAIVision(imageBase64, extractionPrompt, detectedMime);

    // 2️⃣ Gemini Vision (fallback)
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!responseText && GEMINI_KEY) {
      responseText = await callGeminiVision(imageBase64, extractionPrompt, GEMINI_KEY, detectedMime);
    }

    // 3️⃣ Claude Vision (fallback)
    const CLAUDE_KEY = Deno.env.get("CLAUDE_API_KEY");
    if (!responseText && CLAUDE_KEY) {
      responseText = await callClaudeVision(imageBase64, extractionPrompt, CLAUDE_KEY, detectedMime);
    }

    // 4️⃣ All failed
    if (!responseText) {
      console.error("[ADMIN] 🚨 ALL vision APIs failed for page", pageNumber);
      return new Response(
        JSON.stringify({
          success: true, pageNumber, questionsExtracted: 0, reportedTotal: 0,
          pageType: "extraction-pending", questions: [],
          message: "AI thoda busy hai! 🤖 Is page ko baad mein process karenge."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse response
    let extractedQuestions: ExtractedQuestion[] = [];
    let pageType = "question";
    let reportedTotal = 0;

    try {
      let clean = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        extractedQuestions = parsed.questions || [];
        pageType = parsed.page_type || "question";
        reportedTotal = parsed.total_questions_on_page || extractedQuestions.length;
      }
    } catch (parseError) {
      console.error("[ADMIN] ❌ JSON parse error:", parseError);
    }

    console.log(`[ADMIN] 📊 AI extracted ${extractedQuestions.length} raw questions on page ${pageNumber}`);

    const processedQuestions = extractedQuestions.map((q, idx) => {
      if (!q.question || !q.option_a || !q.option_b) return null;
      const finalSubject = q.subject || subject || "Physics";

      let matchedChapter: DatabaseChapter | null = null;
      if (chapterId) {
        matchedChapter = dbChapters.find(ch => ch.id === chapterId) || null;
      }
      if (!matchedChapter) {
        matchedChapter = findBestChapterMatch(q.chapter || chapter || "", finalSubject, dbChapters);
      }
      if (!matchedChapter) return null;

      const matchedTopic = findBestTopicMatch(q.topic || "", matchedChapter.id, dbTopics);
      const isFoundation = (exam || 'JEE').startsWith('Foundation-') || exam === 'Scholarship' || exam === 'Olympiad';
      const finalDifficulty = q.difficulty && ["Easy","Medium","Hard"].includes(q.difficulty)
        ? q.difficulty : determineDifficulty(q.question, [q.option_a, q.option_b, q.option_c||'', q.option_d||'']);

      return {
        ...q,
        subject: finalSubject,
        chapter: matchedChapter.chapter_name,
        chapter_id: matchedChapter.id,
        topic: isFoundation ? null : (matchedTopic?.topic_name || q.topic || null),
        topic_id: isFoundation ? null : (matchedTopic?.id || null),
        difficulty: finalDifficulty,
        exam: exam || "JEE",
      };
    }).filter(Boolean) as any[];

    console.log(`[ADMIN] 📊 After curriculum matching: ${processedQuestions.length} questions for page ${pageNumber}`);

    if (processedQuestions.length > 0) {
      const toInsert = processedQuestions.map((q, idx) => ({
        source_file: sourceFile, page_number: pageNumber,
        parsed_question: { ...q, extraction_index: idx, raw_text_preview: responseText!.substring(0, 500) },
        status: "pending",
      }));
      const { error: insertError } = await supabaseClient.from("extracted_questions_queue").insert(toInsert);
      if (insertError) console.error("[ADMIN] ❌ Insert error:", insertError);
    }

    return new Response(
      JSON.stringify({
        success: true, pageNumber, questionsExtracted: processedQuestions.length,
        reportedTotal, pageType, questions: processedQuestions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ADMIN] 🚨 PDF extraction catastrophic error:", error);
    return new Response(
      JSON.stringify({
        success: true, pageNumber: 0, questionsExtracted: 0, reportedTotal: 0,
        pageType: "error-recovery", questions: [],
        message: "PDF processor thoda confused ho gaya! 📄😅 Dobara try karo!",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
