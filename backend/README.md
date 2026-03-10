# Magic Link Login Backend (GraphQL + Python)

This project provides a GraphQL endpoint that enables frontends to request a **magic login link** sent to a specific email address.

## 🚀 Features
- **GraphQL Mutation**: Request a login link with a single mutation.
- **Secure Token Generation**: Tokens are generated and stored in a SQLite database with expiration.
- **Verification Endpoint**: A GET endpoint is included to verify tokens and handle redirects/authentication.
- **Simulated Emailer**: Emails are logged to the console (perfect for development).

## 🛠 Setup

1.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Run the Server**:
    ```bash
    uvicorn app.main:app --reload
    ```

3.  **Access GraphQL Playground**:
    Go to [http://localhost:8000/graphql](http://localhost:8000/graphql) in your browser.

## 📡 GraphQL Usage

To request a magic link, use the following mutation:

```graphql
mutation RequestMagicLink($email: String!) {
  requestMagicLink(email: $email) {
    success
    message
  }
}
```

**Variables**:
```json
{
  "email": "user@example.com"
}
```

## 🧪 Testing

1.  Execute the mutation in the GraphQL playground.
2.  Check the **terminal output** to see the simulated email and the magic link.
3.  Copy the link (e.g., `http://localhost:8000/verify?token=...`) and paste it into your browser to verify it.
