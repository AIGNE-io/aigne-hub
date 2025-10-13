# Viewing Call History

AIGNE Hub maintains a detailed log of every model API call made through the gateway. This history is invaluable for auditing, debugging integration issues, and performing in-depth analysis of AI model usage. You can access this data programmatically via the API or export it as a CSV file for offline analysis.

## Accessing Call History via API

To retrieve a paginated list of model calls, you can use the `GET /api/user/model-calls` endpoint. This provides a flexible way to query the call history with various filters.

### Request Parameters

You can refine your query using the following parameters:

<x-field-group>
  <x-field data-name="page" data-type="number" data-default="1" data-desc="The page number for pagination."></x-field>
  <x-field data-name="pageSize" data-type="number" data-default="50" data-desc="The number of records to return per page (max 100)."></x-field>
  <x-field data-name="startTime" data-type="string" data-desc="The start of the time range as a Unix timestamp (in seconds)."></x-field>
  <x-field data-name="endTime" data-type="string" data-desc="The end of the time range as a Unix timestamp (in seconds)."></x-field>
  <x-field data-name="search" data-type="string" data-desc="A search term to filter calls by model name, app DID, or user DID."></x-field>
  <x-field data-name="status" data-type="string" data-desc="Filter calls by status. Can be 'success', 'failed', or 'all'."></x-field>
  <x-field data-name="model" data-type="string" data-desc="Filter calls by a specific model name (supports partial matching)."></x-field>
  <x-field data-name="providerId" data-type="string" data-desc="Filter calls by the ID of the AI provider."></x-field>
  <x-field data-name="appDid" data-type="string" data-desc="Filter calls originating from a specific application DID."></x-field>
  <x-field data-name="allUsers" data-type="boolean" data-default="false">
    <x-field-desc markdown>Set to `true` to view calls for all users. This requires **admin** or **owner** privileges.</x-field-desc>
  </x-field>
</x-field-group>

### Example Request

Here is an example of how to retrieve the first page of up to 10 failed calls within a specific time range.

```bash Requesting Failed Calls icon=lucide:terminal
curl -X GET 'https://your-hub-url/api/user/model-calls?pageSize=10&status=failed&startTime=1672531200&endTime=1675209600' \
  -H 'Authorization: Bearer <YOUR_API_TOKEN>'
```

### Response Body

The API returns a JSON object containing the total count, the list of call records, and pagination details.

<x-field-group>
  <x-field data-name="count" data-type="number" data-desc="Total number of records matching the query."></x-field>
  <x-field data-name="list" data-type="array" data-desc="An array of model call objects.">
    <x-field data-name="id" data-type="string" data-desc="Unique identifier for the call record."></x-field>
    <x-field data-name="providerId" data-type="string" data-desc="ID of the AI provider used."></x-field>
    <x-field data-name="model" data-type="string" data-desc="The specific model that was called."></x-field>
    <x-field data-name="type" data-type="string" data-desc="The type of call (e.g., 'chatCompletion', 'embedding')."></x-field>
    <x-field data-name="status" data-type="string" data-desc="The final status of the call ('success' or 'failed')."></x-field>
    <x-field data-name="totalUsage" data-type="number" data-desc="Total usage units (e.g., tokens) for the call."></x-field>
    <x-field data-name="credits" data-type="number" data-desc="The number of credits charged for the call."></x-field>
    <x-field data-name="duration" data-type="number" data-desc="The duration of the API call in milliseconds."></x-field>
    <x-field data-name="userDid" data-type="string" data-desc="The DID of the user who made the call."></x-field>
    <x-field data-name="appDid" data-type="string" data-desc="The DID of the application that initiated the call."></x-field>
    <x-field data-name="callTime" data-type="number" data-desc="Unix timestamp of when the call was made."></x-field>
    <x-field data-name="errorReason" data-type="string" data-desc="Details of the error if the call failed."></x-field>
    <x-field data-name="appInfo" data-type="object" data-desc="Information about the calling application (if available).">
      <x-field data-name="appName" data-type="string" data-desc="Name of the application."></x-field>
      <x-field data-name="appLogo" data-type="string" data-desc="URL to the application's logo."></x-field>
      <x-field data-name="appUrl" data-type="string" data-desc="URL of the application."></x-field>
    </x-field>
    <x-field data-name="userInfo" data-type="object" data-desc="Information about the user who made the call.">
      <x-field data-name="did" data-type="string" data-desc="User's DID."></x-field>
      <x-field data-name="fullName" data-type="string" data-desc="User's full name."></x-field>
      <x-field data-name="email" data-type="string" data-desc="User's email address."></x-field>
      <x-field data-name="avatar" data-type="string" data-desc="URL to the user's avatar."></x-field>
    </x-field>
  </x-field>
  <x-field data-name="paging" data-type="object" data-desc="Pagination information.">
    <x-field data-name="page" data-type="number" data-desc="The current page number."></x-field>
    <x-field data-name="pageSize" data-type="number" data-desc="The number of items per page."></x-field>
  </x-field>
</x-field-group>

## Exporting Call History

For bulk analysis or reporting, you can export the call history to a CSV file using the `GET /api/user/model-calls/export` endpoint. This endpoint accepts the same filtering parameters as the `/model-calls` endpoint, excluding `page` and `pageSize`.

### Example Export Request

This command exports all successful calls for the 'gpt-4' model and saves them to a local file.

```bash Exporting Call History icon=lucide:terminal
curl -X GET 'https://your-hub-url/api/user/model-calls/export?status=success&model=gpt-4' \
  -H 'Authorization: Bearer <YOUR_API_TOKEN>' \
  -o model-calls-export.csv
```

### CSV File Format

The exported CSV file contains a comprehensive set of fields for each call record. The columns are as follows:

| Column         | Description                                                              |
|----------------|--------------------------------------------------------------------------|
| `Timestamp`    | The date and time when the call was created.                             |
| `Request ID`   | The unique identifier for the call record.                               |
| `User DID`     | The DID of the user who made the call.                                   |
| `User Name`    | The full name of the user.                                               |
| `User Email`   | The email address of the user.                                           |
| `Model`        | The AI model that was called.                                            |
| `Provider`     | The display name of the AI provider.                                     |
| `Type`         | The type of call (e.g., `chatCompletion`).                               |
| `Status`       | The final status of the call (`success` or `failed`).                    |
| `Input Tokens` | The number of input tokens consumed.                                     |
| `Output Tokens`| The number of output tokens generated.                                   |
| `Total Usage`  | The total usage units for the call (e.g., total tokens).                 |
| `Credits`      | The number of credits charged for the call.                              |
| `Duration(ms)` | The duration of the API call in milliseconds.                            |
| `App DID`      | The DID of the application that initiated the call, if applicable.       |

## Summary

The call history endpoints provide powerful tools for operators to monitor, audit, and debug AI model interactions within the system. For a higher-level, aggregated view of this data, see the [Monitoring Usage and Costs](./operational-guides-monitoring.md) guide.