# Congress Intercom Mobile App

This is a SwiftUI-based mobile application that implements a Magic Link login flow.

## Features
- **Light Login Page**: Elegant design with blue primary color.
- **Magic Link Request**: Sends an email to the backend via GraphQL.
- **Deep Linking**: Handles the `congressintercom://verify?token=...` scheme to log the user in.

## Prerequisites
- **Xcode 13+** installed on your Mac.
- **Backend Running**: Ensure the Python backend is running at `http://localhost:8000`.
  - *Tip*: If running on a physical iPhone, replace `localhost` with your Mac's local IP address (e.g., `192.168.1.x`) in `Services/AuthManager.swift`.

## How to Run
1. **Open the Project**:
   - You can open the `mobile/CongressIntercom` folder in Xcode. Xcode will recognize it as a Swift Package.
   - *Note*: To run on a physical iPhone, you should create a standard Xcode Project (iOS App) and drag the files in.

2. **Configure URL Scheme** (If creating a new project):
   - In Xcode, select your project in the Project Navigator.
   - Go to the **Info** tab.
   - Under **URL Types**, add a new entry.
   - Set **Identifier** to `com.congress.intercom` and **URL Schemes** to `congressintercom`.

3. **Run on Simulator/iPhone**:
   - Select your target device (e.g., iPhone 14 Simulator).
   - Press **Cmd + R** to build and run.

## Login Flow
1. Open the app.
2. Enter your email address (e.g., `test@example.com`).
3. Click **Log In**.
4. Check your terminal (where the backend is running). The backend simulates sending an email and logs the magic link.
5. Copy the link: `http://localhost:8000/verify?token=...`
6. Paste it into Safari on the Simulator/iPhone.
7. The browser will hit the backend, which will then redirect you to `congressintercom://verify?token=...`.
8. iOS will ask to open the app. Click **Open**.
9. The app will receive the token and sign you in!

## Code Structure
- `CongressIntercomApp.swift`: Main entry point and deep link handler.
- `Views/LoginView.swift`: The beautiful login screen.
- `Views/HomeView.swift`: The dashboard shown after login.
- `Services/AuthManager.swift`: Handles communication with the GraphQL backend.
