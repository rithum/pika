# Chat Session Analysis Prompt

You are an expert customer experience analyst. Analyze the following chat session messages and provide a comprehensive assessment. Read through all messages carefully to understand the complete interaction flow.

## Chat Session Messages:
```
{{chat_messages}}
```

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

### 4. Agent Performance Gaps
- In what specific areas does the agent need to improve?
- Were there missed opportunities to better assist the user?
- Did the agent demonstrate any knowledge gaps or technical limitations?
- Were there communication or tone issues?

### 5. Improvement Recommendations
- Provide specific, actionable suggestions for how the agent could improve
- What training or capabilities would help in similar future interactions?
- Are there process improvements that could enhance the user experience?

### 6. User Satisfaction Assessment
- Was the user satisfied with the interaction? (Satisfied/Neutral/Dissatisfied)
- What evidence supports your satisfaction assessment?
- What were the key factors that contributed to or detracted from satisfaction?

### 7. Enhanced Support Strategies
- What could we do differently to better help the user accomplish their goals?
- Are there proactive measures we could have taken?
- Would different tools, resources, or approaches have been more effective?

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
Please structure your response clearly with numbered sections corresponding to each analysis area above. Use specific examples from the chat session to support your assessments. Be objective and constructive in your feedback.

## Additional Context:
- Focus on actionable insights rather than general observations
- Consider both explicit user feedback and implicit behavioral cues
- Prioritize recommendations based on potential impact on user experience
- Flag any patterns that might indicate systemic issues beyond this single session
