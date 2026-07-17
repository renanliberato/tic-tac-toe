Feature: Playing a game of tic-tac-toe
  As a player
  I want to play tic-tac-toe in the browser
  So that I can see the game state update as I play

  Scenario: The game opens on a home screen
    Given I open the tic-tac-toe game
    Then the home screen is visible
    And the game board is hidden
    And all board cells are disabled
    When I click the "Start game" button
    Then the home screen is hidden
    And the game board is visible
    And all board cells are enabled
    And the status says "Player X's turn"

  Scenario: Matchmaking completes before the game board is available
    Given I open the tic-tac-toe game
    When I start matchmaking
    Then the matchmaking dialog is visible
    And the home screen is hidden
    And the game board is hidden
    And all board cells are disabled
    When matchmaking completes
    Then the matchmaking dialog is hidden
    And the game board is visible
    And all board cells are enabled

  Scenario: A new game starts with an empty board
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    Then all board cells are empty
    And the status says "Player X's turn"

  Scenario: A game identifies both players by friendly names
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    Then the local player card shows a friendly name
    And the opponent card shows a friendly name

  Scenario: Players can take turns and X can win
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    Then the status says "Player X wins!"
    And the board contains "X" in cells 1, 2, and 3
    And the winning cells are highlighted
    And the result dialog is hidden
    And the winning line is shown for cells 1, 2, and 3
    And cell 1 has the accessibility label "Cell 1, X"
    And the result dialog detail says "Three in a row!"
    And all board cells are disabled

  Scenario: A completed win persists player statistics
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    Then player statistics include:
      | games_played | 1 |
      | moves_played | 5 |
      | wins         | 1 |
      | draws        | 0 |
      | losses       | 0 |
    And the result dialog says "X Won"
    And player statistics include:
      | games_played | 1 |
      | moves_played | 5 |
      | wins         | 1 |
      | draws        | 0 |
      | losses       | 0 |
      | last_move    | {"cell":2,"mark":"X"} |


  Scenario: Results are recorded once for each new game
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    Then the result dialog says "X Won"
    When I click the "Continue" button
    And I click the "Start game" button
    And I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    Then player statistics include:
      | games_played | 2 |
      | moves_played | 10 |
      | wins         | 2 |
      | draws        | 0 |
      | losses       | 0 |
      | last_move    | {"cell":2,"mark":"X"} |

  Scenario: An opponent win persists a player loss
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 2
    And I click cell 1
    And I click cell 3
    And I click cell 4
    And I click cell 5
    And I click cell 7
    Then the result dialog says "O Won"
    And player statistics include:
      | games_played | 1 |
      | moves_played | 6 |
      | wins         | 0 |
      | draws        | 0 |
      | losses       | 1 |
      | last_move    | {"cell":6,"mark":"O"} |

  Scenario: An occupied cell cannot be overwritten
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    And I click cell 1
    Then cell 1 contains "X"
    And the status says "Player O's turn"

  Scenario: Continuing after a win returns to the home screen
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    Then the result dialog says "X Won"
    And the result dialog has a "Continue" button
    When I try to dismiss the result dialog
    Then the result dialog says "X Won"
    When I click the "Continue" button
    Then the home screen is visible
    And the game board is hidden

  Scenario: The game ends in a draw when the board is full
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    And I click cell 2
    And I click cell 3
    And I click cell 5
    And I click cell 4
    And I click cell 6
    And I click cell 8
    And I click cell 7
    And I click cell 9
    Then the status says "It's a draw!"
    And the result dialog says "Draw"
    And the result dialog detail says "No spaces left on the board."
    And player statistics include:
      | games_played | 1 |
      | moves_played | 9 |
      | wins         | 0 |
      | draws        | 1 |
      | losses       | 0 |
      | last_move    | {"cell":8,"mark":"X"} |
    And all board cells are disabled

  Scenario: The game page scales to fit the viewport
    Given I open the tic-tac-toe game
    Then the page scale fits the viewport
    When I resize the viewport to 375 by 900
    Then the page scale fits the viewport
