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

  Scenario: The research helper service confines reports to its staging artifacts
    Given a running research helper service
    When I write and read its assigned research artifacts
    Then the research helper reports the staged artifact contents
    And the research helper rejects an unassigned report path

  Scenario: The helper service returns only organic Google result handles
    Given a running research helper service with an organic Google results response
    When I search through the research helper service
    Then the research helper returns ten organic Google result handles
    And the research helper excludes Google navigation links from the results

  Scenario Outline: The helper service rejects unusable Google search responses
    Given a running research helper service with a "<response>" Google response
    When I search through the research helper service
    Then the research helper rejects the search as a "<reason>"

    Examples:
      | response            | reason                |
      | challenge           | challenge page                 |
      | insufficient        | fewer than ten organic results |
