// UI labels drafted by exact opencode-go/glm-5.3 on 26 and 29 September 2026.
// The DAP guide was drafted in session ses_f1580137dffefQrmAXlwirpEuN.
// Edited with Matthew's, Hermes's and unslop writing rules.
export const courseCopy = {
  nav: 'My courses',
  pageTitle: 'My courses',
  signInPrompt: 'Sign in to see your courses.',
  emptyCourses: 'No courses have been added to your account yet.',
  browseCatalog: 'Browse courses & audio',
  catalogNote: 'See available courses and audio on Matthew Tweedie Hypnosis.',
  courseUnavailable: 'This course is not available on your account.',
  markComplete: 'Mark lesson as complete',
  lessonCompleted: 'Lesson complete. Your progress is saved across your devices.',
  loading: 'Loading your courses',
  error: 'Something went wrong. Please try again.',
  playAudio: 'Play audio',
  playVideo: 'Watch video',
  downloadFile: 'Download file',
  mediaLoading: 'Getting this ready for you...',
  mediaError: "That didn't load. Please try again.",
}

export const dapGuide = {
  lessonId: '3a7b109c-4760-5697-aa3f-019ecffd7cc9',
  intro: 'DAP runs for 12 weeks: about 2 weeks of setup, then 10 weeks of practice. Follow these steps in order.',
  steps: [
    { title: 'Start with the basics', text: 'Do the baseline testing first. Then watch the Why DAP? video.' },
    { title: 'Start your journal', text: 'Write down anxious thoughts and rate each one 1 to 10. Keep the journal going through the whole program.' },
    { title: 'Learn Chapters 1 to 4', text: 'Work through these lessons before Chapter 5. Plan on 2 to 3 weeks for them.' },
    { title: 'Measure each week', text: 'Repeat the DASS-21 and K10 measures once a week.' },
    { title: 'Add the audio', text: 'After your first week of journaling, use the Hypno-Meditation 2 to 3 times a day.' },
    { title: 'Move to Chapter 5', text: 'Once you have 2 weeks of journaling and Chapters 1 to 4 done, learn the Anxiety Zapper. Keep journaling and keep the weekly measures.' },
  ],
  purchaseStep: { title: 'Build your audio', text: 'About 4 weeks after starting the Zapper, follow the Hypnotic Reprogramming lessons to make a custom audio. Later lessons show you how.' },
}

export function dapGuideSteps(grantSource) {
  return grantSource === 'purchase' ? [...dapGuide.steps, dapGuide.purchaseStep] : dapGuide.steps
}
