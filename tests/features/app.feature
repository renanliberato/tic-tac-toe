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

  Scenario: A new game starts with an empty board
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    Then all board cells are empty
    And the status says "Player X's turn"

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
    And cell 1 has the accessibility label "Cell 1, X"
    And the result dialog detail says "Three in a row!"
    And all board cells are disabled

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
    And all board cells are disabled
