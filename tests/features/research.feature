Feature: Task-scoped research

  Scenario: A task-scoped research run publishes a validated advisory report
    Given a task-scoped research workspace
    When I run research with a valid staged synthesis
    Then the task-scoped research report is published
    And the report records ten consulted sources

  Scenario: The researcher action boundary accepts only one safe declaration
    When a researcher submits a valid declared search action
    Then the action boundary returns the declared search action
    When the researcher submits a multi-line action
    Then the action boundary rejects the action
