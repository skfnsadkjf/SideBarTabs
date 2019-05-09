# $id is the only option that needs to change when porting to another addon.
$id = "{e0695a0a-6a63-4d90-a89d-2a9004f2cc4b}"

git status
git add .
git commit --no-edit --allow-empty-message
git archive -o grim.xpi HEAD
git push



pause
