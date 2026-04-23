"""Response verification and auto-reprompt.

Classifies agent responses as A/B/C/F/U and optionally triggers a reprompt.
"""
import json
import os
import re

VERIFICATION_MODEL_ID = os.environ.get('VERIFICATION_MODEL_ID', 'us.anthropic.claude-haiku-4-5-20251001-v1:0')

REPROMPTS = {
    'A': None,
    'B': 'The previous response had assumptions that were stated. Specify the assumptions you made.',
    'C': 'The previous response had assumptions that were not specified. Specify the assumptions you made.',
    'F': 'The previous response is not factually correct. Fix it with factually correct information.',
    'U': None,
}


def parse_verification_response(raw: str) -> dict:
    """Extract classification and explanation from <answer>JSON</answer> XML tag."""
    match = re.search(r'<answer>(.*?)</answer>', raw, re.DOTALL)
    if not match:
        return {'classification': 'U', 'explanation': ''}
    try:
        parsed = json.loads(match.group(1))
        classification = parsed.get('classification', 'U')
        if classification not in ('A', 'B', 'C', 'F', 'U'):
            classification = 'U'
        return {'classification': classification, 'explanation': parsed.get('explanation', '')}
    except (json.JSONDecodeError, KeyError):
        return {'classification': 'U', 'explanation': ''}


def get_reprompt_for_classification(classification: str) -> str | None:
    """Return the reprompt text for a classification, or None if no reprompt needed."""
    return REPROMPTS.get(classification)


def build_reprompt_message(reprompt_text: str, explanation: str) -> str:
    """Format a reprompt message with the explanation."""
    return f'{reprompt_text}\n\nReason: {explanation}'


def verify_response(question: str, answer: str, bedrock_client) -> dict:
    """Run the verification classification and return {classification, explanation}."""
    verify_prompt = (
        'You are a response verification agent. Classify the accuracy of the following response.\n\n'
        f'<question>{question}</question>\n<response>{answer}</response>\n\n'
        'Classify as one of:\n'
        '  A = Accurate\n'
        '  B = Accurate with stated assumptions\n'
        '  C = Accurate with unstated assumptions\n'
        '  F = Inaccurate\n\n'
        'Respond in this exact format:\n'
        '<answer>{"classification": "X", "explanation": "brief reason"}</answer>'
    )

    body = json.dumps({
        'anthropic_version': 'bedrock-2023-05-31',
        'max_tokens': 500,
        'temperature': 0,
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': verify_prompt}]}],
    })

    response = bedrock_client.invoke_model(modelId=VERIFICATION_MODEL_ID, body=body)
    parsed = json.loads(response['body'].read())
    raw_text = parsed.get('content', [{}])[0].get('text', '')
    return parse_verification_response(raw_text)
