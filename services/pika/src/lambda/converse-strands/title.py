"""Session title generation via Bedrock Haiku."""
import json
import os

TITLE_MODEL_ID = os.environ.get('TITLE_MODEL_ID', 'us.anthropic.claude-haiku-4-5-20251001-v1:0')


def generate_session_title(question: str, answer: str, bedrock_client) -> str:
    """Generate a 3-8 word session title using Haiku.

    Args:
        question: The user's message.
        answer: The agent's response text.
        bedrock_client: A boto3 bedrock-runtime client.

    Returns:
        The generated title string.

    Raises:
        ValueError: If Bedrock returns an unexpected response structure.
    """
    prompt = (
        'Generate a concise title (3-8 words) that captures the main topic or question from this '
        f'conversation:\n\n<question>{question}</question>\n<response>{answer}</response>\n\n'
        'The title should be specific enough to distinguish this conversation from others.\n\n'
        'IMPORTANT: Return ONLY the title text with no explanations, quotes, or additional text.'
    )

    body = json.dumps({
        'anthropic_version': 'bedrock-2023-05-31',
        'max_tokens': 200,
        'temperature': 1,
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': prompt}]}],
    })

    response = bedrock_client.invoke_model(modelId=TITLE_MODEL_ID, body=body)
    parsed = json.loads(response['body'].read())

    content = parsed.get('content', [])
    if not content or 'text' not in content[0]:
        raise ValueError(
            f'Bedrock returned unexpected response structure for title generation: {json.dumps(parsed)}'
        )
    return content[0]['text'].strip()
