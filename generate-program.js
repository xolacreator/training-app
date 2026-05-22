/**
 * Claude AI Program Generator
 * Generates training programs based on user goals and constraints
 */

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DEFAULT_SESSION_LIBRARY = `
- Zone 2 Run: Easy aerobic, 30-60min, HR Zone 2 (RPE 6)
- Tempo Run: Threshold work, 25-30min @ race pace, RPE 7-8
- VO2max (Track): 4-6 repeats, 600m-1000m, 2-3min recovery, RPE 9
- Aerobic Speed: 6-8 × 400m, shorter reps, 90% effort, RPE 8
- Recovery Run: 20-30min easy, RPE 4-5
- Fitstop PERFORM: Hybrid circuit, 50min, moderate intensity
- Fitstop LIFT: Strength + conditioning, 50min, moderate intensity
- Strength Session: Progressive overload work
- Erg (Row/SkiErg/Bike): 10-20min effort + recovery
- Mixed Stations: Run + Erg + Bodyweight rotations, 45min
- Rest/Mobility: Recovery day, active stretching, 30min
`;

async function generateProgram(params) {
  const {
    goal = "general fitness",
    weeks = 12,
    frequency = 4,
    focus = "general",
    constraints = "none",
    sessionLibrary = DEFAULT_SESSION_LIBRARY,
  } = params;

  const systemPrompt = `You are an expert strength and conditioning coach specializing in running and hybrid training programs. 
Generate periodized training programs that follow evidence-based principles.
Always output valid JSON only, with no additional text.`;

  const userPrompt = `Generate a ${weeks}-week training program:

GOAL: ${goal}
FREQUENCY: ${frequency} sessions/week
FOCUS: ${focus}
CONSTRAINTS: ${constraints}

Available sessions: ${sessionLibrary}

Output as JSON (${weeks} weeks, ${frequency} sessions each):
{
  "name": "Program Name",
  "goal": "${goal}",
  "weeks": ${weeks},
  "frequency": ${frequency},
  "weeks": [
    {
      "number": 1,
      "phase": "base",
      "theme": "Theme",
      "volume": "~25km",
      "sessions": [
        {
          "day": "Monday",
          "session": "Zone 2 Run",
          "duration": "40 min",
          "intensity": "easy",
          "description": "Description"
        }
      ]
    }
  ]
}`;

  try {
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let program;
    try {
      program = JSON.parse(responseText);
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        program = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse response");
      }
    }

    return {
      success: true,
      program,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    };
  } catch (error) {
    console.error("Claude API error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  generateProgram,
};
