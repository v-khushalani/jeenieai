# Planner grade filter, free-only AI, open roast

## 1. Class 12 student ko sirf Class 12 chapters

Aaj grade-wise filter sirf Foundation (Class 6-10) par lagta hai. JEE/NEET students ke liye koi class filter nahi hai, isliye ladder mein Class 11 ke chapters bhi aa jaate hain.

Fix: filter ko Class 11 aur 12 par bhi lagao.
- Class 12 student -> sirf `class_level = 12` chapters (aur woh chapters jinka class_level set hi nahi hai).
- Class 11 student -> sirf Class 11.
- Dropper / grade set nahi -> jaisa abhi hai (11 + 12 dono).
- Ladder ke header mein chhota label: "Class 12 syllabus".

## 2. Sirf free models — Gemini Pro hatao

JEEnie abhi Pro+ users ke deep/master answers ke liye `google/gemini-2.5-pro` use karta hai. Woh hata denge; sab tiers ab `google/gemini-3.6-flash` par chalenge (yahi default free-tier friendly model hai). Pro+ users ko lambe/deeper answers phir bhi milenge — word cap aur token ceiling wahi rahenge, sirf model badlega.

## 3. Roast — modes hatao, khula aur topic-specific

Abhi 8 fixed personas hain (bada bhai, brainrot, aunty, prof...), har persona ka apna template — isliye hook/structure repeat lagta hai.

Naya behaviour:
- Persona system poora hata do (server prompt + card ka persona badge + client persona rotation).
- Ek hi open prompt: model ko koi style box nahi milega, sirf topic, accuracy, aur "go crazy" instruction — har call par apna angle chunega.
- Topic-specificity aur strong: chapter ke concept hooks ko compulsory banao (formula, law, mechanism ka naam roast mein aana chahiye), taaki roast "tu physics mein weak hai" jaisa generic na lage.
- Repeat rokne ke liye: pichle 10 roasts avoid-list mein jaate rahenge (already hai) + ek random "angle" seed (wordplay / filmy / sports / exam-hall scene / dark-humour / relationship analogy) taaki structure har baar naya ho.
- Fallback bank (offline / AI fail) waise hi rahega, par persona label UI se hat jayega.

## Technical notes

- `src/lib/roadmapEngine.ts` aur `src/components/AIStudyPlanner.tsx` (dono jagah same chapter query hai): class filter ko `exam === 'Foundation'` ke bahar nikal kar 11/12 ke liye bhi apply karna.
- `supabase/functions/jeenie/index.ts`: `usePro` / `gemini-2.5-pro` branch remove, `PRO_MODEL_ENABLED` flag ka use hatao.
- `supabase/functions/_shared/jeeniePrompt.ts`: `RoastPersona`, `ROAST_PERSONAS`, `PERSONA_STYLE`, `pickRoastPersona` delete; `buildRoastPrompt` se persona param hatao, angle-seed add karo, hook rule mandatory karo.
- `src/components/RoastMemeCard.tsx`: `PERSONAS`, `PERSONA_LABEL`, persona state aur badge hatao.
- Edge function redeploy + ek live roast call se verify (do baar chalake dekhna ki lines alag aa rahi hain).
