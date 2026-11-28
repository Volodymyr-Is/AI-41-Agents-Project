import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { CATALOG } from '@/src/models';
import type { AIAnalysis, ExerciseItem } from './types';

function buildWorkoutPrompt(exercises: ExerciseItem[]): string {
  const workoutDescription = exercises
    .map((ex, i) => {
      if (ex.type === 'strength') {
        return `${i + 1}. [Strength] ${ex.name}: ${ex.sets} sets x ${ex.reps} reps ${ex.weight ? `(${ex.weight} kg)` : ''} ${ex.notes ? `- Note: ${ex.notes}` : ''}`;
      }
      return `${i + 1}. [Cardio] ${ex.name}: Distance ${ex.distance} km, Speed ${ex.speed} km/h, Time ${ex.time} mins ${ex.notes ? `- Note: ${ex.notes}` : ''}`;
    })
    .join('\n');

  return `
You are an elite Sports Scientist and Certified Strength & Conditioning Specialist (CSCS).
Analyze the following workout session log:

${workoutDescription}

Provide actionable, high-quality, professional feedback structured strictly into JSON matching this format:
{
  "remove": ["Specific redundant or risky exercise / junk volume to remove or avoid"],
  "improve": ["Specific technique, pacing, rest interval, or rep cadence improvement"],
  "add": ["Specific complementary exercise, mobility drill, or warmup/cooldown to add next time"],
  "summary": "2-3 sentences of overall coach evaluation on intensity, balance, and effectiveness",
  "score": 85,
  "estimatedRecoveryHours": 24,
  "tags": ["Hypertrophy", "Endurance", "Push Focus"]
}

Return ONLY pure valid JSON without markdown fences.
`;
}

export async function analyzeWorkout(exercises: ExerciseItem[]): Promise<AIAnalysis> {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (openRouterApiKey && openRouterApiKey.trim() !== '') {
    try {
      return await analyzeWithOpenRouter(exercises, openRouterApiKey.trim());
    } catch (err) {
      console.warn('OpenRouter Gemma 4 API call failed, attempting fallback:', err);
    }
  }

  if (geminiApiKey && geminiApiKey.trim() !== '') {
    try {
      return await analyzeWithGemini(exercises);
    } catch (err) {
      console.warn('Gemini API call failed, attempting fallback:', err);
    }
  }

  if (openAiApiKey && openAiApiKey.trim() !== '') {
    try {
      return await analyzeWithOpenAI(exercises, openAiApiKey);
    } catch (err) {
      console.warn('OpenAI API call failed, attempting fallback:', err);
    }
  }

  return generateHeuristicAnalysis(exercises);
}

async function analyzeWithOpenRouter(exercises: ExerciseItem[], apiKey: string): Promise<AIAnalysis> {
  const spec = CATALOG['gemma-4-openrouter'];
  const openrouter = createOpenAICompatible({
    name: 'openrouter',
    baseURL: spec.baseUrl ?? 'https://openrouter.ai/api/v1',
    apiKey,
    headers: {
      'HTTP-Referer': 'https://github.com/Volodymyr-Is/AI-41-Agents-Project',
      'X-Title': 'FitPulse AI Sports Diary',
    },
  });

  const result = await generateText({
    model: openrouter.chatModel(spec.id),
    prompt: buildWorkoutPrompt(exercises),
  });

  return parseAIResponse(result.text);
}

async function analyzeWithGemini(exercises: ExerciseItem[]): Promise<AIAnalysis> {
  const result = await generateText({
    model: google(CATALOG['gemini-3.8-flash'].id),
    prompt: buildWorkoutPrompt(exercises),
  });

  return parseAIResponse(result.text);
}

async function analyzeWithOpenAI(exercises: ExerciseItem[], apiKey: string): Promise<AIAnalysis> {
  const workoutDescription = exercises
    .map((ex, i) => {
      if (ex.type === 'strength') {
        return `${i + 1}. [Strength] ${ex.name}: ${ex.sets} sets x ${ex.reps} reps ${ex.weight ? `(${ex.weight} kg)` : ''}`;
      }
      return `${i + 1}. [Cardio] ${ex.name}: Distance ${ex.distance} km, Speed ${ex.speed} km/h, Time ${ex.time} mins`;
    })
    .join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CATALOG['gpt-5.6-luna'].id,
      messages: [
        {
          role: 'system',
          content: 'You are an elite sports coach. Analyze workouts and respond strictly with valid JSON without markdown.',
        },
        {
          role: 'user',
          content: `Analyze this workout:\n${workoutDescription}\n\nFormat:\n{"remove": string[], "improve": string[], "add": string[], "summary": string, "score": number, "estimatedRecoveryHours": number, "tags": string[]}`,
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API returned status ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content || '{}';
  return parseAIResponse(text);
}

function parseAIResponse(rawText: string): AIAnalysis {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(cleaned) as Partial<AIAnalysis>;
    return {
      remove: Array.isArray(parsed.remove) ? parsed.remove : ['Excessive isolated fatigue sets'],
      improve: Array.isArray(parsed.improve) ? parsed.improve : ['Focus on controlled eccentric tempo (2-3s descent)'],
      add: Array.isArray(parsed.add) ? parsed.add : ['Dynamic mobility warmup and post-workout static stretches'],
      summary: parsed.summary || 'Solid workout session with good volume distribution.',
      score: typeof parsed.score === 'number' ? Math.min(100, Math.max(10, parsed.score)) : 85,
      estimatedRecoveryHours: typeof parsed.estimatedRecoveryHours === 'number' ? parsed.estimatedRecoveryHours : 24,
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['General Fitness'],
      analyzedAt: new Date().toISOString(),
    };
  } catch {
    return generateHeuristicAnalysis([]);
  }
}

export function generateHeuristicAnalysis(exercises: ExerciseItem[]): AIAnalysis {
  const strengthList = exercises.filter((e): e is Extract<ExerciseItem, { type: 'strength' }> => e.type === 'strength');
  const cardioList = exercises.filter((e): e is Extract<ExerciseItem, { type: 'cardio' }> => e.type === 'cardio');

  const removeList: string[] = [];
  const improveList: string[] = [];
  const addList: string[] = [];
  const tags: string[] = [];

  let totalSets = 0;
  let totalCardioMins = 0;
  let totalDistance = 0;

  for (const s of strengthList) {
    totalSets += s.sets || 1;
  }
  for (const c of cardioList) {
    totalCardioMins += c.time || 0;
    totalDistance += c.distance || 0;
  }

  if (strengthList.length > 0 && cardioList.length > 0) {
    tags.push('Hybrid Training');
    if (totalCardioMins > 30 && totalSets > 12) {
      removeList.push('High-intensity cardio right before heavy compound lifts to avoid central nervous system fatigue.');
    }
    improveList.push('Separate intense cardio and heavy strength by at least 6 hours, or place cardio at the end of the session.');
  }

  if (strengthList.length > 0) {
    tags.push('Strength & Hypertrophy');
    const highRepExercises = strengthList.filter((s) => s.reps > 15);
    const lowRepExercises = strengthList.filter((s) => s.reps < 6);
    const firstHighRep = highRepExercises[0];
    const firstLowRep = lowRepExercises[0];

    if (totalSets > 20) {
      removeList.push(`Reduce total volume from ${totalSets} sets down to 12-16 high-quality sets to prevent junk volume.`);
    }

    if (firstHighRep) {
      improveList.push(`Increase load on ${firstHighRep.name} into the 8-12 rep range for optimal hypertrophy stimulus.`);
    } else if (firstLowRep) {
      improveList.push(`Ensure 2.5 to 3 minutes of rest between heavy sets of ${firstLowRep.name} for full ATP recovery.`);
    } else {
      improveList.push('Implement progressive overload by adding 1-2.5kg or 1 extra rep next session.');
    }

    addList.push('Rotator cuff / scapular stability warm-up and 5 minutes of core bracing work.');
    addList.push('Antagonist muscle pair work (e.g. Facepulls / Rear Delt flyes) for joint balance.');
  }

  if (cardioList.length > 0) {
    tags.push('Cardiovascular Endurance');
    for (const c of cardioList) {
      if (c.speed > 12 && c.time > 30) {
        removeList.push('Sustained maximum pace for long durations; incorporate structured zone 2 aerobic base pacing.');
      }
      improveList.push(`Maintain steady cadence (160-180 spm for running, 85-95 rpm for cycling) during ${c.name}.`);
    }

    addList.push('5-minute cool-down walk followed by hip flexor and hamstring dynamic stretching.');
    if (totalDistance > 5) {
      addList.push('Electrolyte rehydration and foam rolling for lower body recovery.');
    }
  }

  if (removeList.length === 0) {
    removeList.push('Avoid performing duplicate isolation exercises targeting the exact same movement angle.');
  }
  if (improveList.length === 0) {
    improveList.push('Track time-under-tension (focus on 2-3s controlled eccentric lowering).');
  }
  if (addList.length === 0) {
    addList.push('10-minute dynamic mobility routine prior to first work set.');
  }

  const score = Math.min(95, Math.max(65, 80 + (strengthList.length > 0 ? 5 : 0) + (cardioList.length > 0 ? 5 : 0) - (totalSets > 25 ? 10 : 0)));
  const estimatedRecoveryHours = totalSets > 15 || totalCardioMins > 45 ? 48 : 24;

  let summary = `Balanced ${tags.join(' & ')} session. Good exertion levels with solid workout volume.`;
  if (strengthList.length > 0 && cardioList.length > 0) {
    summary = `Great hybrid session combining strength resistance (${strengthList.length} movements) with cardio endurance (${totalDistance.toFixed(1)} km).`;
  } else if (strengthList.length > 0) {
    summary = `Focused resistance session with ${strengthList.length} exercises and ${totalSets} total sets. Solid muscle recruitment.`;
  } else if (cardioList.length > 0) {
    summary = `High aerobic output with ${totalDistance.toFixed(1)} km covered across ${totalCardioMins} minutes.`;
  }

  return {
    remove: removeList.slice(0, 3),
    improve: improveList.slice(0, 3),
    add: addList.slice(0, 3),
    summary,
    score,
    estimatedRecoveryHours,
    tags,
    analyzedAt: new Date().toISOString(),
  };
}
