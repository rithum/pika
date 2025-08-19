import { PromptType } from "@aws-sdk/client-bedrock-agent-runtime";

interface PostProcessingEvent {
	invokeModelRawResponse: string;
}
interface PostProcessingResponse {
	promptType: PromptType;
	postProcessingParsedResponse: {
		responseText?: string;
	}
}
export const handler = async (event: PostProcessingEvent): Promise<PostProcessingResponse> => {
	console.log("EVENT:", JSON.stringify(event, null, 2));

	let rawResponse = event.invokeModelRawResponse;
	try {
	 rawResponse= JSON.parse(event.invokeModelRawResponse).content[0].text;
	}catch(e){
		// Unexpected format, just return the raw response
		console.error("Unexpected format, just return the raw response", e);
	}

	// extract the response text from the raw response
	let parts = rawResponse.match(/<final_response>([\s\S]*?)<\/final_response>/s);

	if (parts == null) {
		throw new Error("Could not parse raw LLM output")
	}


	let parsedResponse: PostProcessingResponse = {
		promptType: PromptType.POST_PROCESSING,
		postProcessingParsedResponse: {
			responseText: parts[1]
		}
	}

	// TODO: Should we do this if the response is not in the expected format?
	// parse the response text from the raw response (removes double escapes)
	//let a = JSON.parse(`{"a":"${parts[1]}"}`).a;
	//parsedResponse.postProcessingParsedResponse.responseText = a;

	console.log("RESPONSE:", JSON.stringify(parsedResponse, null, 2));

	return parsedResponse;
}
