use super::robots::blocks as robots_blocks;

#[test]
fn merges_applicable_groups_case_insensitively() {
    // Given: separate matching groups with mixed-case directives and multiple agents.
    let robots = "uSeR-aGeNt: OtherBot\nUsEr-AgEnT: StudyAppBot\nDisallow: /one\n\nUser-agent: studyappbot\nDisallow: /two";

    // When: paths from both applicable groups are checked.
    let blocked = ["/one/item", "/two/item"].map(|path| robots_blocks(robots, path));

    // Then: rules from every specific group are merged.
    assert_eq!(blocked, [true, true]);
}

#[test]
fn longest_matching_allow_rule_wins_and_query_is_matched() {
    // Given: an exception longer than its disallow and a query-specific rule.
    let robots = "User-agent: *\nDisallow: /docs\nAllow: /docs/public\nDisallow: /*?download=*";

    // When: the exception, ordinary path, and query target are checked.
    let blocked = [
        robots_blocks(robots, "/docs/public/index.html"),
        robots_blocks(robots, "/docs/private"),
        robots_blocks(robots, "/file?download=yes"),
    ];

    // Then: longest-match precedence and query matching are honored.
    assert_eq!(blocked, [false, true, true]);
}

#[test]
fn specific_agent_groups_override_wildcard_groups() {
    // Given: wildcard denial and a matching specific allow-only group.
    let robots = "User-agent: *\nDisallow: /\n\nUser-agent: StudyAppBot\nAllow: /";

    // When: the importer checks a path.
    let blocked = robots_blocks(robots, "/questions");

    // Then: only the most-specific user-agent groups apply.
    assert!(!blocked);
}

#[test]
fn allow_wins_when_matching_rules_have_equal_length() {
    // Given: conflicting rules with the same matching path length.
    let robots = "User-agent: StudyAppBot\nDisallow: /same\nAllow: /same";

    // When: the tied path is checked.
    let blocked = robots_blocks(robots, "/same/path");

    // Then: allow wins the tie as required by the robots protocol.
    assert!(!blocked);
}
