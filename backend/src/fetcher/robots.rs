#[derive(Clone, Copy)]
enum RuleKind {
    Allow,
    Disallow,
}

struct Rule {
    kind: RuleKind,
    pattern: String,
}

#[derive(Default)]
struct Group {
    agents: Vec<String>,
    rules: Vec<Rule>,
}

pub(super) fn blocks(content: &str, target: &str) -> bool {
    let groups = parse_groups(content);
    let specific = applicable_rules(&groups, "studyappbot");
    let rules = if specific.is_empty() {
        applicable_rules(&groups, "*")
    } else {
        specific
    };
    rules
        .into_iter()
        .filter(|rule| wildcard_match(&rule.pattern, target))
        .max_by_key(|rule| {
            (
                specificity(&rule.pattern),
                matches!(rule.kind, RuleKind::Allow),
            )
        })
        .is_some_and(|rule| matches!(rule.kind, RuleKind::Disallow))
}

fn parse_groups(content: &str) -> Vec<Group> {
    let mut groups = Vec::new();
    let mut current = Group::default();
    for line in content.lines() {
        let line = line.split('#').next().unwrap_or_default().trim();
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let name = name.trim();
        let value = value.trim();
        if name.eq_ignore_ascii_case("user-agent") {
            if !current.rules.is_empty() {
                groups.push(current);
                current = Group::default();
            }
            if !value.is_empty() {
                current.agents.push(value.to_ascii_lowercase());
            }
        } else if name.eq_ignore_ascii_case("allow") {
            if !current.agents.is_empty() && !value.is_empty() {
                current.rules.push(Rule {
                    kind: RuleKind::Allow,
                    pattern: value.to_owned(),
                });
            }
        } else if name.eq_ignore_ascii_case("disallow")
            && !current.agents.is_empty()
            && !value.is_empty()
        {
            current.rules.push(Rule {
                kind: RuleKind::Disallow,
                pattern: value.to_owned(),
            });
        }
    }
    if !current.agents.is_empty() {
        groups.push(current);
    }
    groups
}

fn applicable_rules<'a>(groups: &'a [Group], agent: &str) -> Vec<&'a Rule> {
    groups
        .iter()
        .filter(|group| group.agents.iter().any(|candidate| candidate == agent))
        .flat_map(|group| group.rules.iter())
        .collect()
}

fn specificity(pattern: &str) -> usize {
    pattern
        .bytes()
        .filter(|byte| !matches!(byte, b'*' | b'$'))
        .count()
}

fn wildcard_match(pattern: &str, target: &str) -> bool {
    let anchored = pattern.ends_with('$');
    let pattern = pattern.strip_suffix('$').unwrap_or(pattern).as_bytes();
    let target = target.as_bytes();
    let (mut pattern_index, mut target_index) = (0, 0);
    let (mut star, mut retry_target) = (None, 0);
    while target_index < target.len() {
        if pattern_index == pattern.len() && !anchored {
            return true;
        }
        if pattern.get(pattern_index) == target.get(target_index) {
            pattern_index += 1;
            target_index += 1;
        } else if pattern.get(pattern_index) == Some(&b'*') {
            star = Some(pattern_index);
            pattern_index += 1;
            retry_target = target_index;
        } else if let Some(star_index) = star {
            retry_target += 1;
            target_index = retry_target;
            pattern_index = star_index + 1;
        } else {
            return false;
        }
    }
    while pattern.get(pattern_index) == Some(&b'*') {
        pattern_index += 1;
    }
    pattern_index == pattern.len()
}
