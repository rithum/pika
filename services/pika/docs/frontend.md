# Front End 

## Assumptions that Need to Be True On Page Load

When a user hits the front end we assume the following...

* The user is authenticated before hitting the chat page
* The page then has access to these values which we need
  * companyId
  * companyType (retailer | supplier)
  * userId (string)
  * firtName
  * lastName

## When the page loads

* We will need to make calls to the `/api/chat` API Gatway endpoint for various things
  and we will need to pass it something that allows it to authenticate the user
  and get the authenticated user (userId).
* We need to get the timezone of the user in the browser and pass it to APIs (the IANA Time Zone Database format)

  `Intl.DateTimeFormat().resolvedOptions().timeZone`
* We will need to retrieve the list of chat sessions that may exist for the user:

  `GET /api/chat/conversations`

## User Actions
* If a user clicks on an old chat session we will need to go get all of the messages of that chat session
  
  `GET /api/chat/{sessionId}/messages`
* When a user adds a question to the prompt input text area and clicks the submit button, we need
  to call the converse lambda function url and stream the results back

  `POST function-url`

  ```ts
  for await (const chunk of response.body) {
    const parsedChunk = new TextDecoder().decode(chunk);
    addChunkToDisplay(parsedChunk);
  }
  ```
* When a user asks for suggestions, call this API to get a giant list of suggestions

  `GET /api/chat/suggestions`

