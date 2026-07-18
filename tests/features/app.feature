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
    And player statistics include:
      | battle_pass_points | 1 |

  Scenario: A player claims a reached monthly battle-pass reward
    Given I have a player profile with 2 battle-pass points
    And I open the tic-tac-toe game
    When I open the battle pass
    Then the battle pass screen is visible
    And the battle pass shows 100 milestones
    And the battle pass progress says "2 / 100 points"
    And battle-pass milestone 1 is claimable
    And battle-pass milestone 3 is locked
    When I claim battle-pass milestone 1
    Then the battle-pass announcement says "1 gold claimed from milestone 1"
    And battle-pass milestone 1 is claimed
    And player statistics include:
      | battle_pass_points  | 2 |
      | battle_pass_claimed | 1 |
      | coin_balance        | 1 |
      | pending_coins       | 1 |
    When I return from the battle pass
    Then the battle pass screen is hidden
    And the home screen is visible
    And the battle pass button has focus

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
  Scenario: A queued reward consumed in another tab is not presented
    Given I open the tic-tac-toe game with 3 pending coins
    When I dismiss daily gifts
    Then a coin celebration is active
    When I open daily gifts
    And I claim the daily gift
    And the daily gift claim animation completes
    And another tab consumes 10 pending coins
    And the coin celebration completes
    Then no coin celebration is active
    And the coin balance shows "0013"
    And player statistics include:
      | coin_balance  | 13 |
      | pending_coins | 0  |
