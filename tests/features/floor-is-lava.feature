Feature: Floor Is Lava daily climb
  As a local player
  I want to climb the daily Floor Is Lava event
  So that winning a best-of-three match advances my daily attempt

  Scenario: Winning a daily climb advances the visible next stage
    Given I open the tic-tac-toe game during Floor Is Lava hours
    When I open Floor Is Lava
    Then the Floor Is Lava screen is visible
    And the Floor Is Lava climb shows twelve daily climbers and me
    And the Floor Is Lava start is available for stage 1
    When I start the Floor Is Lava match
    Then the game board is visible
    And the opponent card shows the daily lava climber portrait
    When I click cell 1
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
    Then the result dialog says "You won!"
    When I click the "Continue" button
    Then the Floor Is Lava screen is visible
    And the Floor Is Lava start is available for stage 2
    And the Floor Is Lava attempt has 1 win and active status
    When I return from Floor Is Lava
    Then the home screen is visible
