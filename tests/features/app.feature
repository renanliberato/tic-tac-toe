Feature: Playing against the Computer
  As a local player
  I want to play X against a random Computer opponent
  So that nobody can manually play O

  Scenario: A Computer match starts immediately
    Given I open the tic-tac-toe game
    Then the home screen is visible
    And the game board is hidden
    When I click the "Start game" button
    Then the home screen is hidden
    And the game board is visible
    And the first board cell has focus
    And all board cells are enabled
    And the local player card indicates the active turn
    And the turn announcement says "Your turn"
    And the opponent card shows the Computer

  Scenario: The board locks while the Computer chooses a random free cell
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 5
    Then cell 5 contains "X"
    And all board cells are disabled
    And the opponent player card indicates the active turn
    And the turn announcement says "Computer is thinking…"
    When the computer move completes
    Then cell 1 contains "O"
    And the turn announcement says "Your turn"
    And the local player card indicates the active turn

  Scenario: Rapid clicks cannot place a second human mark
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 5
    And I click cell 6
    Then cell 5 contains "X"
    And cell 6 contains ""
    When the computer move completes
    Then player statistics include:
      | games_played | 1 |
      | moves_played | 1 |
      | last_move    | {"cell":4,"mark":"X"} |

  Scenario: The Computer has a fixed AI identity
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    Then the opponent card shows the Computer
    And the local player card shows a friendly name

  Scenario: The game page scales to fit the viewport
    Given I open the tic-tac-toe game
    Then the page scale fits the viewport
    When I resize the viewport to 375 by 900
    Then the page scale fits the viewport

  Scenario: The human is announced as the match winner
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    And the computer move completes
    And I click cell 4
    And the computer move completes
    And I click cell 7
    And the winning-line animation completes
    And I click cell 1
    And the computer move completes
    And I click cell 4
    And the computer move completes
    And I click cell 7
    And the winning-line animation completes
    And I click cell 1
    And the computer move completes
    And I click cell 4
    And the computer move completes
    And I click cell 7
    Then the turn announcement says "You won!"
    And the result dialog says "You won!"

  Scenario: The Computer is announced as the match winner
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 9
    And the computer move completes
    And I click cell 8
    And the computer move completes
    And I click cell 6
    And the computer move completes
    And the winning-line animation completes
    And I click cell 9
    And the computer move completes
    And I click cell 8
    And the computer move completes
    And I click cell 6
    And the computer move completes
    And the winning-line animation completes
    And I click cell 9
    And the computer move completes
    And I click cell 8
    And the computer move completes
    And I click cell 6
    And the computer move completes
    Then the turn announcement says "Computer won!"
    And the result dialog says "Computer won!"
