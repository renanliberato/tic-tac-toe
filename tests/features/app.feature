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
    And the O player score is 3

  Scenario: The weekly leaderboard shows standings and returns to home
    Given I open the tic-tac-toe game
    When I open the weekly leaderboard
    Then the leaderboard screen is visible
    And the home screen is hidden
    And the leaderboard shows its position, player, and score columns
    And the leaderboard shows the local player with score 0
    And the leaderboard shows ranked opponents
    When I return from the weekly leaderboard
    Then the leaderboard screen is hidden
    And the home screen is visible
    And the leaderboard button has focus

  Scenario: The floating leaderboard row returns to the local position
    Given I open the tic-tac-toe game
    When I open the weekly leaderboard
    And I prepare the leaderboard local row for scrolling
    And I activate the floating local leaderboard row
    Then the local leaderboard row has focus
    And the leaderboard scrolls the local row to the center
    And the page scroll position is unchanged

  Scenario: A player views their profile and buys and switches board styles
    Given I have a player profile with 20 coins and match statistics
    And I open the tic-tac-toe game
    When I open my profile
    Then the profile screen shows my match statistics
    When I click the "Styles" button
    Then the style catalog shows 9 styles and a balance of "0020"
    When I choose the "Forest" style
    Then the "Forest" style is equipped with 11 coins remaining
    And the style announcement says "Purchased and equipped Forest"
    When I choose the "Classic" style
    Then the "Classic" style is equipped with 11 coins remaining
    And the style announcement says "Equipped Classic"
    When I go back
    Then the profile screen shows my match statistics
    When I go back
    Then the home screen is visible

  Scenario: A player cannot buy a board style without enough coins
    Given I have a player profile with 11 coins and match statistics
    And I open the tic-tac-toe game
    When I open my profile
    And I click the "Styles" button
    And I choose the "Ocean" style
    Then an insufficient coins dialog says "You need 8 more coins to unlock Ocean"
    When I click the "OK" button
    Then the last style choice regains focus
    And player statistics include:
      | coin_balance   | 11      |
      | owned_styles   | classic |
      | equipped_style | classic |
