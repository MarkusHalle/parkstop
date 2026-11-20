# Publishing ParkStop on GitHub Pages

Hosting choice: public repository + GitHub Pages (D46). The site will be at
**https://markushalle.github.io/parkstop/** if the repository is called `parkstop`
(another name changes the last part of the address; the build adapts by itself).

## One-time setup (the owner does these)

1. **Create the repository.** Open <https://github.com/new>, signed in as `MarkusHalle`.
   - Repository name: `parkstop`
   - Visibility: **Public**
   - Leave "Add a README", ".gitignore" and "licence" **unticked** (the project already has them).
   - Click **Create repository**. Leave the page that follows open; it shows the address
     `https://github.com/MarkusHalle/parkstop.git`.
2. **Switch Pages to GitHub Actions.** In the new repository: **Settings → Pages →
   Build and deployment → Source: GitHub Actions**. Nothing else on that page needs changing.
3. **Tell Claude to add the remote and push.** (Claude asks for an explicit yes before each.)
   The commit itself is made in the main ParkStop session first. Commands, for reference:

   ```bash
   git remote add origin https://github.com/MarkusHalle/parkstop.git
   git push -u origin main
   ```

   The first push may open a GitHub sign-in window (Git Credential Manager); sign in there.
4. **Watch the deploy.** Repository → **Actions** tab → "Deploy to GitHub Pages". It runs the
   checks, builds with the `/parkstop/` path and publishes. About 2–3 minutes. When it is green,
   the run page shows the site link.

## Every later release

Commit in the main session and push to `main`. The deploy runs by itself. An installed app shows
the "Frissítés" toast the next time it checks (on opening, or hourly).

## If something goes wrong

- **Deploy job says Pages is not enabled** → step 2 was skipped. Set Source to GitHub Actions and
  re-run the workflow (Actions → the failed run → Re-run all jobs).
- **Site shows a blank page** → the repository name and the address differ; open the address
  shown in the Actions run, not a typed one.
- **Take the site down** → Settings → Pages → Unpublish site (the repository stays).
