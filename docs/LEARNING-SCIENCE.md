# Learning science used by Study Companion

This document records the product decisions behind the tutor. It is not a claim that one interface can replace a teacher or that every technique works equally well for every learner.

## Product rules

1. **Protect effort before revealing answers.** Start with an orienting cue, then a targeted hint, then a partially worked step. Give a complete solution immediately when the learner explicitly asks for one, and finish with one small check for understanding.
2. **Use retrieval, not passive repetition.** Ask the learner to recall a principle, predict the next step, or explain why a step follows. Store a short retrieval prompt for later review when course memory is enabled.
3. **Space review.** Resurface weak or developing concepts after the session instead of encouraging repeated same-session rereading.
4. **Give actionable feedback.** Identify what is correct, the first meaningful gap, and the next action. Avoid vague praise and error dumps.
5. **Calibrate guidance.** Novices and stuck learners get concise worked examples; support fades as competence improves. More fluent learners get transfer questions.
6. **Keep visual guidance non-destructive.** Boxes, highlights, arrows, numbered steps, and ghosted equation fragments live only on the Study Companion overlay. They never alter the source notes.
7. **Keep the live loop short.** Spoken replies are concise, visual directions are localized, and the assistant asks at most one small follow-up at a time.

## Evidence base

- Cepeda et al. (2006), *Psychological Bulletin*: a quantitative synthesis of 839 assessments found robust benefits from distributed practice and showed that the useful spacing interval depends on the desired retention interval. https://pubmed.ncbi.nlm.nih.gov/16719566/
- Mawson & Kang (2025), *Behavioral Sciences*: a classroom-focused meta-analysis found a moderate advantage for distributed over massed practice. https://pubmed.ncbi.nlm.nih.gov/40564553/
- Roediger & Karpicke (2006), *Psychological Science*: retrieval practice improved delayed retention compared with repeated study, even when repeated study created greater confidence. https://pubmed.ncbi.nlm.nih.gov/16507066/
- Karpicke & Blunt (2011), *Science*: retrieval practice produced stronger learning than elaborative concept mapping in the reported experiments. https://pubmed.ncbi.nlm.nih.gov/21252317/
- McDermott (2021), *Annual Review of Psychology*: reviews evidence that retrieval shortly after learning slows forgetting across materials, ages, abilities, and classroom settings. https://pubmed.ncbi.nlm.nih.gov/33006925/
- Chi et al. (1989), *Cognitive Science*: successful learners generated more self-explanations, connected solution actions to domain principles, and monitored their own understanding while studying worked physics examples. https://doi.org/10.1207/s15516709cog1302_1
- Chen et al. (2023), *Educational Psychology*: worked examples reduced cognitive load and improved retention and transfer for multi-step mathematics problems in the reported experiment. https://eric.ed.gov/?id=EJ1402965
- Hattie & Timperley (2007), *Review of Educational Research*: feedback effectiveness depends on the type and level of feedback, motivating the product's goal/progress/next-action structure. https://doi.org/10.3102/003465430298487
- Sinha & Kapur (2021), *Review of Educational Research*: a meta-analysis of productive-failure designs found benefits when problem solving before instruction was implemented with the intended design features. https://eric.ed.gov/?id=EJ1308129
- Kestin et al. (2025), *Scientific Reports*: in a crossover RCT in an undergraduate physics course, a carefully scaffolded AI tutor produced larger learning gains in less time than the comparison active-learning lesson; the authors caution against assuming this generalizes to every setting. https://www.nature.com/articles/s41598-025-97652-6
- Bastani et al. (2025), *PNAS*: unrestricted GPT access improved supported practice performance but reduced later unaided performance in the study, while tutor guardrails largely mitigated the negative effect. https://doi.org/10.1073/pnas.2422633122

## Deliberate limits

- The app does not silently complete work or write into Notability.
- Visual annotations are suggestions over a captured frame, not proof that handwriting was interpreted correctly.
- Recency is a ranking signal, not a truth signal. Topical relevance and explicit syllabus dates take priority.
- Course memory and review scheduling remain local and opt-in.
