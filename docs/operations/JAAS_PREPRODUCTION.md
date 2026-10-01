# JaaS on PreProduction (tafseel.runasp.net)

Tafseel signs a short-lived RS256 token for each participant on the server. JaaS holds the public key; the private
key is a file on the server. It is never published, logged or sent to the browser.

1. Open the JaaS Console: <https://jaas.8x8.vc>.
2. Open **API Keys**.
3. **Add API key**, then generate a new RSA key pair (or upload your own public key).
4. Record the **App ID**: `vpaas-magic-cookie-…` (shown at the top of the console).
5. Record the **Key ID**: `vpaas-magic-cookie-…/xxxxxx` (the new key's row).
6. Download the **private key** (`.pk` / `.pem`) and keep it on your machine only. Do not paste it into chat, e-mail
   or the repository (`*.pem` and `*.key` are git-ignored).
7. Configure the three Tafseel PreProduction settings:
   - `JaaS:AppId` and `JaaS:KeyId` are in `src/Tafseel.Api/appsettings.PreProduction.json`. Change them only if
     you created a different key.
   - `JaaS:PrivateKeyPath` is `App_Data/jaas/jaas-private-key.pem`. In the MonsterASP File Manager, create
     `wwwroot\App_Data\jaas\` and upload the private key there, renamed to `jaas-private-key.pem`. App_Data is not served
     to the web, and deployments neither overwrite nor delete it.
8. Restart the site (MonsterASP control panel → Websites → tafseel.runasp.net → Restart), or deploy.
   Without the key file the site refuses to start; upload the key first.
9. Test: book a live session between `student@gmail.com` and `teacher@gmail.com`. Inside the join window
   (15 minutes before the start), open the session as each of them in two browsers and select **Join**:
   - both land in the same room;
   - the teacher is the moderator;
   - a third account gets "not found".
