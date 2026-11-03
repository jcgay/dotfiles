# Narrate the video (`--narrate`)

A voice tells the reviewer what each step shows, while it happens. A UI video
also gets a caption per step, for whoever watches with the sound off. All
offline: `scripts/narrate.sh` uses macOS `say` with a Premium or Enhanced
voice, else Piper through `uvx` (it downloads the voice once, no account).

`<narrate>` below is the absolute path of `scripts/narrate.sh` in this skill.
Everything goes in `<capture dir>/voice/`.

## 1. The sentences, before any capture

The scenario step 3 approved carries one sentence per step, in the language
of the PR description: what the viewer sees and why it matters, as you would
say it to a colleague. Spell out numbers that the voice would misread
("cent-treizième", not "113ᵉ"). The caption is a short version of the
sentence, under 70 characters.

Write the sentences to `<capture dir>/voice/lines.txt`, one per line, then:

```bash
<narrate> clips "<capture dir>/voice" <locale>   # fr_FR, en_US… → s<i>.wav, prints "i duration"
```

The durations set the pace of the capture, so make the clips first. The
first line on stderr names the voice: tell the user. A clip over 12 s is a
step that says too much: split it.

## 2. UI: a capture script, run in one Bash call

Shell state is lost between tool calls, so the capture is one script in
`<capture dir>/voice/capture.sh`. Run it from `<capture dir>/voice`:
`playwright-cli` writes its snapshots to the current directory.

```bash
#!/bin/bash
. <narrate> "<capture dir>/voice"
p() { playwright-cli -s=pr-demo "$@" >/dev/null 2>&1 || echo "FAIL: $*" >&2; }

p goto '<first page of the scenario>'   # before video-start: the video starts on the change
p video-start "<capture dir>/pr-<N>-raw.webm" --cursor --size 1280x720
start
mark 0; caption "<caption 0>"
p click '...'; p type '...'             # the step's actions happen while it is said
wait_clip 0
mark 1; caption "<caption 1>"
...
wait_clip <last>; sleep 1
p video-stop
```

- `mark <i>` before the step's actions: the sentence starts as they do.
  `wait_clip <i>` holds the next step until the sentence is over.
- Each `playwright-cli` call takes one or two seconds. Typing, choosing and
  submitting a form between two sentences leaves a silence: do it before
  `video-start`, or under a sentence long enough to cover it.
- A `FAIL:` line on stderr: the step did not happen. Fix the selector and
  record again; never mix a voice over a broken capture.

## 3. CLI: offsets from the tape

`vhs` plays the tape at a fixed pace, so the offsets are computed, not
measured. One step per clip: `Type` the command, `Enter`, then
`Sleep` the clip's duration plus one second, rounded up, and more if the
command's output takes longer to appear. Clip 0 starts at 0. Clip `i`
starts after every earlier step: the command's length × `TypingSpeed`, plus
its `Sleep`. Write `<capture dir>/voice/offsets.txt`, one `<i> <ms>` per line.

No captions in a terminal: the commands already say what runs.

## 4. Mix and check

```bash
<narrate> mix "<capture dir>/pr-<N>-raw.webm" "<capture dir>/voice" "<capture dir>/pr-<N>.webm"
```

It copies the picture and adds an Opus track, and fails if the output has
no audio. Extract one frame per step
(`ffmpeg -v error -ss <s> -i <file> -frames:v 1 -update 1 -y <png>`) and
look at each: the caption and the screen must show the same thing. You
cannot hear the result. Say so to the user, and give them the file to
listen to before publishing.

`--compare` narrates the PR video only: the base video has no voice.
