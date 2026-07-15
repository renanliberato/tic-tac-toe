Feature: Playing a game of tic-tac-toe
  As a player
  I want to play tic-tac-toe in the browser
  So that I can see the game state update as I play

  Scenario: A new game starts with an empty board
    Given I open the tic-tac-toe game
    Then all board cells are empty
    And the status says "Player X's turn"

  Scenario: Players can take turns and X can win
    Given I open the tic-tac-toe game
    When I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    Then the status says "Player X wins!"
    And the board contains "X" in cells 1, 2, and 3
    And all board cells are disabled

  Scenario: An occupied cell cannot be overwritten
    Given I open the tic-tac-toe game
    When I click cell 1
    And I click cell 1
    Then cell 1 contains "X"
    And the status says "Player O's turn"

  Scenario: A new game resets the board
    Given I open the tic-tac-toe game
    When I click cell 1
    And I click the "New game" button
    Then all board cells are empty
    And the status says "Player X's turn"

  Scenario: The game ends in a draw when the board is full
    Given I open the tic-tac-toe game
    When I click cell 1
    And I click cell 2
    And I click cell 3
    And I click cell 5
    And I click cell 4
    And I click cell 6
    And I click cell 8
    And I click cell 7
    And I click cell 9
    Then the status says "It's a draw!"
    And all board cells are disabled
