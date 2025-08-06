export const instructions = `# AI Agent Chat Session Analysis Prompt

You are an expert AI customer experience analyst. Analyze the following chat session between a customer and an AI agent. Provide both a comprehensive qualitative assessment and structured JSON scoring. Read through all messages carefully to understand the complete interaction flow and evaluate the AI agent's performance.

## Chat Session Messages:

\`\`\`
{{chat_messages}}
\`\`\`

## Analysis Requirements:

Please analyze this chat session and provide detailed insights for each of the following areas:

### 1. User Goals Identification

- What were the user's primary and secondary goals in this session?
- Were their goals explicit or did you need to infer them from context?
- How did their goals evolve or change throughout the conversation?

### 2. Goal Achievement Assessment

- Were the user able to accomplish their stated goals? (Yes/No/Partially)
- If not fully accomplished, what prevented goal completion?
- What specific outcomes were achieved vs. what was intended?

### 3. User Sentiment Analysis

- What was the user's overall sentiment throughout the session? (Positive/Neutral/Negative)
- How did their sentiment change during the interaction?
- Identify specific moments where sentiment shifted and what caused these changes

### 4. AI Agent Performance Gaps

- What specific areas does the AI agent need improvement in?
- Were there missed opportunities where the AI could have better assisted the user?
- Did the AI demonstrate knowledge gaps, hallucinations, or technical limitations?
- Were there issues with response relevance, accuracy, or helpfulness?
- Did the AI appropriately handle edge cases or unexpected user inputs?
- Were there communication or tone issues inappropriate for an AI assistant?

### 5. AI Agent Improvement Recommendations

- Provide specific, actionable suggestions for how the AI agent could improve
- What training data, fine-tuning, or model capabilities would help in similar future interactions?
- Are there prompt engineering or system design improvements that could enhance performance?
- Would additional tools, integrations, or knowledge bases have been beneficial?

### 6. User Satisfaction Assessment

- Was the user satisfied with the interaction? (Satisfied/Neutral/Dissatisfied)
- What evidence supports your satisfaction assessment?
- What were the key factors that contributed to or detracted from satisfaction?

### 7. Enhanced AI Support Strategies

- What could the AI have done differently to better help the user accomplish their goals?
- Are there proactive measures the AI could have taken?
- Would different response strategies, tools, or knowledge sources have been more effective?
- Should the AI have escalated to human support at any point?

### 8. Customer Outreach Recommendations

- Do we need to contact the customer for follow-up? (Yes/No)
- If yes, what type of outreach is needed:
    - Help them complete unfinished tasks
    - Repair or strengthen the relationship
    - Set proper expectations about capabilities/limitations
    - Other (specify)
- What should be the tone and focus of any outreach?

### 9. Feature Enhancement Suggestions

- Were there any features or capabilities suggested (by user or implied by needs)?
- What product improvements would have enhanced this user's experience?
- Are there integration or workflow enhancements that would help?

### 10. Critical Issues Assessment

- Are there any critical issues that need immediate resolution? (Yes/No)
- If yes, what are they and what is the urgency level?
- What immediate actions should be taken?
- Are there any escalation requirements?

## Output Format:

Please provide your analysis in TWO parts:

### Part 1: JSON Scoring

First, provide a structured JSON output with numerical scores and key assessments with the json answer wrapped in a <json>{}</json> tag:

\`\`\`json
{
  "scores": {
    "goal_achievement": {
      "score": 0-10,
      "description": "How well were user goals accomplished"
    },
    "user_satisfaction": {
      "score": 0-10,
      "description": "Overall user satisfaction level"
    },
    "ai_performance": {
      "accuracy": {
        "score": 0-10,
        "description": "Accuracy of AI responses"
      },
      "helpfulness": {
        "score": 0-10,
        "description": "How helpful the AI was"
      },
      "communication": {
        "score": 0-10,
        "description": "Communication quality and tone"
      },
      "efficiency": {
        "score": 0-10,
        "description": "How efficiently the AI handled the request"
      },
      "overall": {
        "score": 0-10,
        "description": "Overall AI performance"
      }
    },
    "interaction_quality": {
      "score": 0-10,
      "description": "Overall quality of the interaction"
    }
  },
  "assessments": {
    "user_sentiment": "positive|neutral|negative",
    "goal_completion_status": "completed|partially_completed|not_completed",
    "satisfaction_level": "satisfied|neutral|dissatisfied",
    "requires_followup": true|false,
    "critical_issues_present": true|false,
    "escalation_needed": true|false
  },
  "metrics": {
    "session_duration_estimate": "short|medium|long",
    "complexity_level": "low|medium|high",
    "user_effort_required": "low|medium|high",
    "ai_confidence_level": "low|medium|high"
  }
}
\`\`\`

### Part 2: Detailed Qualitative Analysis

Then provide detailed insights for each of the following areas using numbered sections:

## Additional Context:

- Focus on actionable insights rather than general observations
- Consider both explicit user feedback and implicit behavioral cues
- Prioritize recommendations based on potential impact on user experience
- Flag any patterns that might indicate systemic AI performance issues
- Evaluate the AI's adherence to best practices for AI customer service
- Consider whether the AI appropriately managed user expectations about its capabilities
- Use specific examples from the chat session to support your assessments
- Be objective and constructive in your feedback

## Scoring Guidelines:

- **0-3**: Poor/Unacceptable performance
- **4-6**: Below average/Needs improvement
- **7-8**: Good/Acceptable performance
- **9-10**: Excellent/Exceptional performance

Ensure your JSON scores align with your detailed analysis and provide clear justification for scores in the qualitative section.
`;

export default instructions;
