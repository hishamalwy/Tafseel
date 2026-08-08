# Prompt-Injection Evaluation

Adversarial cases cover attempts to reveal prompts/secrets, create catalog rows, expose hidden Teachers, rank Teachers, bypass qualification/service status, issue refunds, call tools, browse the web, and inject HTML/script.

Controls verified in code/tests: no Teacher data in provider input; no tool configuration; no generic proxy; strict typed schema; canonical resolution; output text bindings; unsupported policy pre-guard; bounded inputs. Live-model adversarial scoring remains unrun with the semantic datasets because no key was available.
