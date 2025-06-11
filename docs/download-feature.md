# Downloads Feature

If you want your tools to return a file that can be downloaded in the front end
chat application...

1. Create the file to be downloaded in this bucket
   \`const uploadBucketNameParam = ssm.StringParameter.fromStringParameterName(this, 'UploadBucketNamePara', `/stack/pika/${this.stage}/s3/upload_bucket_name`);\`

1. Put the file in a directory named `downloads/{agent-id}/{xxx}` where agent-id is the ID of the
agent that creates the file and xxx can be anything you want (subdir + file name or just file name).

1. If your file does not start with `downloads/{agent-id}` then the link will not be rendered in the
front end chat app as a security measure.

1. Modify your agent instructions to include something very similar to this

```md
* **Custom Tags Supported**
    * Downloads \`<download></download>\`
* **Download URL Handling**
    * When you encounter a URL with the format \`download://{s3-key}?title={title}\`, replace it
    with \`<download>{"s3Key": "{s3-key}", "title": "{decoded-title}"}</download>\`
    * **Rules**
        * Extract s3-key from the path
        * URL-decode title if present, omit if missing
        * Apply this replacement anywhere you'd output a URL
    * **Example:** \`download://doc-456?title=My%20Document\` → \`<download>{"s3Key": "doc-456", "title": "My Document"}</download>\`
```

1. In the content you return back to the LLM from your tool, include a link in this format wherever
you want a link to be: `download://{s3-key}?title={title}`.  Note title is optional but highly
recommended.