# Doing
- [ ] Fix AI coach lines issue.
- [ ] Let the user manage their card decks (manually, through AI)


# Todo
- [ ] Fine tune accuracy calculation and estimated ELO.
- [x] Fix flashcards section to make better use of the space (maybe puzzles on the right, info   on the left [for variety])
- [x] Implement chess game fetching through Chess.com API. (UI element --> Add a "Sync" button to replace the "Import new button" game. Put the import new game button at the header for the Games View.)

- [ ] Add onHover for move rating graph in game reviews, for eval bar, and other areas in the app ()
- [ ] Add play button functionality (move through moves until the next thing to fix [mistake, blunders, ect, any small mistake.])
- [ ] Fix weird resizing bug where the chessboard looks choppy in splitscreen.
- [ ] Fix SVG chess icons inside 
- [ ] Include sound effects (at some points)


- [ ] Add more user data (later, brainstorm w/AI what to include.)
    - [ ] User statistics (mistakes fixed, what time they perform the best, ect)
- [ ] Create account for Appwrite (gh student dev)
- [ ] Setup Appwrite auth & database for the app.

- [ ] Fix the logo (look at Bridgemind to see how they did it)
- [ ] Fix the generic icons used in the home screen.

- [ ] Add Lichess API integration.
- [ ] Add the stuff requried for SaaS apps (from the video)
- [ ] Build an actually good onboarding.
- [ ] UI tweaks. Make everything prettier (fine details)
- [ ] Include themes in the profile section (TweakCN themes, more wood textures, ect)
- [ ] Potentially implement puzzles feature (similar to Chess.com, but actually free and based on mistakes made in real games)


# Done
- [x] Annotation toggle --> Let the user toggle animations so that when talking to the chatbot, the chatbot can animate the board.
- [x] System prompt is too inefficient. (too big + still causing halucinations.)
- [x] Right click functionality (drag works great, but I want to right click to circle pieces!)
- [x] For flashcards and game review: Implement click to move using the "onSquareClick". The chessboard should now be able to move through either dragging or clicking.
- [x] Fix chessboard height in review section (should be higher)
- [x] Implement stockfish on games.
- [x] Implement "game review" user flow. 
    - Let the user walk through each move they've made
    - Have AI explanation for mistakes and blunders, where the user can directly talk to the 
    AI to deeply understand the position
        - Gemini API w/stockfish prompt engineering.
- [x] Import new game button should bring up a popup in the middle of the screen, with an option to pick the png or fen for the game.
- [x] Fix colour theme of the app.
- [x] Let the user use arrow keys to move between moves in the game review section
- [x] Remove search and gear icons (unnessecary)
- [x] Change buttons in the app from flat to the expo app's ones.
- [x] Replace "drill" with "Practice" in the sidebar.
- [x] Remove pulsing effect from the chessboard.
- [x] Switch postiions of the Move list & AI coach review.
- [x] Fix hover colours and selected colours for the sidebar.