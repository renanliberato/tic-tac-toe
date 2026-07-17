Feature: Playing a game of tic-tac-toe
  As a player
  I want to play tic-tac-toe in the browser
  So that I can see the game state update as I play

  Scenario: A player claims the recurring daily gift
    Given I open the tic-tac-toe game
    Then the daily gifts dialog is visible
    And the daily gift progress shows day 1 available with seven rewards
    And the coin balance shows "0000"
    When I claim the daily gift
    And the daily gift claim animation completes
    Then the daily gifts dialog is hidden
    And player statistics include:
      | coin_balance  | 10 |
      | pending_coins | 10 |
    When the coin celebration completes
    Then the coin balance shows "0010"
    And player statistics include:
      | coin_balance  | 10 |
      | pending_coins | 0  |
    When I open daily gifts
    Then the daily gifts dialog is visible
    And the daily gift is already claimed

  Scenario: A daily gift claimed in another tab updates this tab
    Given I open the tic-tac-toe game
    Then the daily gifts dialog is visible
    When another tab claims the daily gift
    Then the daily gifts dialog is hidden
    And the coin balance shows "0010"
    And player statistics include:
      | coin_balance | 10 |

  Scenario: A reward synced during a coin celebration is presented next
    Given I open the tic-tac-toe game with 3 pending coins
    When I dismiss daily gifts
    Then a coin celebration is active
    When another tab claims the daily gift
    And the coin celebration completes
    Then a coin celebration is active
    And player statistics include:
      | coin_balance  | 13 |
      | pending_coins | 10 |
    When the coin celebration completes
    Then the coin balance shows "0013"
    And player statistics include:
      | coin_balance  | 13 |
      | pending_coins | 0  |

  Scenario: The game opens on a home screen
    Given I open the tic-tac-toe game
    Then the home screen is visible
    And the game board is hidden
    And all board cells are disabled
    When I click the "Start game" button
    Then the home screen is hidden
    And the game board is visible
    And the first board cell has focus
    And all board cells are enabled
    And the local player card indicates the active turn
    And the turn announcement says "Player X's turn"
    And the status says ""

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
    And the local player card indicates the active turn
    And the turn announcement says "Player X's turn"
    And the status says ""

  Scenario: The initial turn announcement is rendered once
    Given I open the tic-tac-toe game
    When I watch the turn announcement
    And I click the "Start game" button
    Then the turn announcement changes once

  Scenario: A game identifies both players by friendly names
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    Then the local player card shows a friendly name
    And the opponent card shows a friendly name

  Scenario: Players can take turns and X can win
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    Then the turn announcement says "Player O's turn"
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    Then the status says ""
    And the turn announcement says "Player X won!"
    And the board contains "X" in cells 1, 2, and 3
    And the board renders X and O as SVG icons
    And the winning cells are highlighted
    And the result dialog is hidden
    And the winning line is shown for cells 1, 2, and 3
    And cell 1 has the accessibility label "Cell 1, X"
    And the X player score is 1
    And all board cells are disabled
    When the winning-line animation completes
    Then all board cells are empty
    And the X player score is 1
    And the turn announcement says "Player X's turn"

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
    And the X player score is 1
    When the winning-line animation completes
    Then player statistics include:
      | games_played | 2 |
      | moves_played | 5 |
      | wins         | 1 |
      | draws        | 0 |
      | losses       | 0 |


  Scenario: Results are recorded once for each round and a new match resets its score
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    When the winning-line animation completes
    And I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    When the winning-line animation completes
    And I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    Then the result dialog says "X Won"
    And the X player score is 3
    And player statistics include:
      | games_played | 3 |
      | moves_played | 15 |
      | wins         | 3 |
      | draws        | 0 |
      | losses       | 0 |
      | last_move    | {"cell":2,"mark":"X"} |
    When I click the "Continue" button
    And I click the "Start game" button
    Then the X player score is 0
    And the O player score is 0

  Scenario: An opponent win persists a player loss
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 2
    And I click cell 1
    And I click cell 3
    And I click cell 4
    And I click cell 5
    And I click cell 7
    Then the O player score is 1
    When the winning-line animation completes
    Then all board cells are empty
    And the O player score is 1
    And player statistics include:
      | games_played | 2 |
      | moves_played | 6 |
      | wins         | 0 |
      | draws        | 0 |
      | losses       | 1 |

  Scenario: An occupied cell cannot be overwritten
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    And I click cell 1
    Then cell 1 contains "X"
    And the opponent player card indicates the active turn
    And the status says ""

  Scenario: Continuing after the final match win returns to the home screen
    Given I open the tic-tac-toe game
    When I click the "Start game" button
    And I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    When the winning-line animation completes
    And I click cell 1
    And I click cell 4
    And I click cell 2
    And I click cell 5
    And I click cell 3
    When the winning-line animation completes
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
    And the coin balance shows "0000"
    When the coin celebration completes
    Then the coin balance shows "0003"
    And the coin holder has accessibility label "Coin balance: 3"
    And the coin announcement says "3 coins earned; balance 3"
    And player statistics include:
      | coin_balance  | 3 |
      | pending_coins | 0 |

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
    Then the X player score is 0
    And all board cells are empty
    And player statistics include:
      | games_played | 2 |
      | moves_played | 9 |
      | wins         | 0 |
      | draws        | 1 |
      | losses       | 0 |

  Scenario: The game page scales to fit the viewport
    Given I open the tic-tac-toe game
    Then the page scale fits the viewport
    When I resize the viewport to 375 by 900
    Then the page scale fits the viewport
