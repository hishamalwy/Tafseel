/*
  Hard-delete AspNetUsers by Id, including roles and dependent rows.

  WARNING
  - Irreversible. Staging/local only unless you explicitly intend otherwise.
  - Most FKs are Restrict, so leaf rows must be deleted first.
  - Actor-only references on OTHER users' records are also removed when
    the actor is in @Users (history/moderation/audit rows).

  Usage
  1. Put the user Ids below.
  2. Run the PREVIEW block first.
  3. If the preview looks right, run the PURGE block in the same session.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('tempdb..#Users') IS NOT NULL DROP TABLE #Users;
CREATE TABLE #Users (Id nvarchar(450) NOT NULL PRIMARY KEY);

-- Keep staging demos: admin@, student@, quality@, teacher@gmail.com
INSERT INTO #Users (Id) VALUES
  (N'1603e52a-dcd6-4115-9bdd-9570cf7dbdf8'), -- homos@gmail.com
  (N'1b31846e-54ea-4ce4-b57f-bb812f87dbf4'), -- homoss@gmail.com
  (N'2f693139-5c7a-4e86-8589-62dc1a66eea3'), -- asd@gmail.com
  (N'32e1c534-4fd4-4ae3-a882-4b603bf7fe60'), -- shrimpooooo5@gmail.com
  (N'41abe1d2-3800-4610-b711-d1636dbdea24'), -- ahmedhassan24298@gmail.com
  (N'65291504-78c1-4a60-b53c-eeb71d1d5a9c'), -- nagham.j.alwy@gmail.con
  (N'7a89eeda-94d5-4d84-9768-a94f842b11f9'), -- ahmedhassanmaksoud98@gmail.com
  (N'dbd52be5-aa85-4840-85bd-365e20aae6b2'), -- s@gmail.com
  (N'dfefb90b-60b5-46bb-ab89-a434be8f995a'), -- hisham.alwy.dev@gmail.com
  (N'e5d882df-7425-4904-90bf-2def3bf2fef0'), -- h@gmail.com
  (N'f7338002-1538-4b71-a187-06cdddc164be'); -- nagham.j.alwy@gmail.com


/* ========================= PREVIEW ========================= */
SELECT u.Id, u.Email, u.UserName, u.FullName, u.EmailConfirmed, u.IsSuspended
FROM AspNetUsers u
INNER JOIN #Users t ON t.Id = u.Id;

SELECT r.Name AS RoleName, ur.UserId
FROM AspNetUserRoles ur
INNER JOIN AspNetRoles r ON r.Id = ur.RoleId
INNER JOIN #Users t ON t.Id = ur.UserId;

SELECT 'TeacherApplications' AS [Table], COUNT(*) AS RowsFound FROM TeacherApplications WHERE TeacherId IN (SELECT Id FROM #Users)
UNION ALL SELECT 'Orders', COUNT(*) FROM Orders WHERE StudentId IN (SELECT Id FROM #Users) OR TeacherId IN (SELECT Id FROM #Users)
UNION ALL SELECT 'LearningRequests', COUNT(*) FROM LearningRequests WHERE StudentId IN (SELECT Id FROM #Users) OR TeacherId IN (SELECT Id FROM #Users)
UNION ALL SELECT 'LiveSessionBookings', COUNT(*) FROM LiveSessionBookings WHERE StudentId IN (SELECT Id FROM #Users) OR TeacherId IN (SELECT Id FROM #Users)
UNION ALL SELECT 'Payments', COUNT(*) FROM Payments WHERE StudentId IN (SELECT Id FROM #Users)
UNION ALL SELECT 'Notifications', COUNT(*) FROM Notifications WHERE UserId IN (SELECT Id FROM #Users)
UNION ALL SELECT 'RefreshTokens', COUNT(*) FROM RefreshTokens WHERE UserId IN (SELECT Id FROM #Users)
UNION ALL SELECT 'AspNetUserRoles', COUNT(*) FROM AspNetUserRoles WHERE UserId IN (SELECT Id FROM #Users);

/* Preview above already reviewed — execute purge below. */
-- RETURN;

/* ========================= PURGE ========================= */
BEGIN TRANSACTION;

DECLARE @UserIds TABLE (Id nvarchar(450) PRIMARY KEY);
INSERT INTO @UserIds SELECT Id FROM #Users;

DECLARE @AppIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @AppIds SELECT Id FROM TeacherApplications WHERE TeacherId IN (SELECT Id FROM @UserIds);

DECLARE @RequestIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @RequestIds
SELECT Id FROM LearningRequests
WHERE StudentId IN (SELECT Id FROM @UserIds) OR TeacherId IN (SELECT Id FROM @UserIds);

DECLARE @OrderIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @OrderIds
SELECT Id FROM Orders
WHERE StudentId IN (SELECT Id FROM @UserIds)
   OR TeacherId IN (SELECT Id FROM @UserIds)
   OR LearningRequestId IN (SELECT Id FROM @RequestIds);

DECLARE @BookingIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @BookingIds
SELECT Id FROM LiveSessionBookings
WHERE StudentId IN (SELECT Id FROM @UserIds) OR TeacherId IN (SELECT Id FROM @UserIds);

DECLARE @PaymentIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @PaymentIds
SELECT Id FROM Payments
WHERE StudentId IN (SELECT Id FROM @UserIds)
   OR OrderId IN (SELECT Id FROM @OrderIds)
   OR LiveSessionBookingId IN (SELECT Id FROM @BookingIds);

DECLARE @DisputeIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @DisputeIds
SELECT Id FROM Disputes
WHERE StudentId IN (SELECT Id FROM @UserIds)
   OR TeacherId IN (SELECT Id FROM @UserIds)
   OR OpenedById IN (SELECT Id FROM @UserIds)
   OR OrderId IN (SELECT Id FROM @OrderIds);

DECLARE @ReviewIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @ReviewIds
SELECT Id FROM TeacherReviews
WHERE StudentId IN (SELECT Id FROM @UserIds)
   OR TeacherId IN (SELECT Id FROM @UserIds)
   OR OrderId IN (SELECT Id FROM @OrderIds);

DECLARE @ConversationIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @ConversationIds
SELECT DISTINCT ConversationId
FROM ConversationParticipant
WHERE UserId IN (SELECT Id FROM @UserIds);

DECLARE @MessageIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @MessageIds
SELECT Id FROM Messages
WHERE SenderId IN (SELECT Id FROM @UserIds)
   OR ConversationId IN (SELECT Id FROM @ConversationIds);

DECLARE @NotificationIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @NotificationIds
SELECT Id FROM Notifications WHERE UserId IN (SELECT Id FROM @UserIds);

DECLARE @ServiceIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @ServiceIds
SELECT Id FROM TeacherServices WHERE TeacherId IN (SELECT Id FROM @UserIds);

DECLARE @LedgerAccountIds TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @LedgerAccountIds
SELECT Id FROM LedgerAccounts WHERE OwnerId IN (SELECT Id FROM @UserIds);

/* Governance / disputes */
DELETE FROM DisputeEvidence WHERE DisputeId IN (SELECT Id FROM @DisputeIds) OR UploadedById IN (SELECT Id FROM @UserIds);
DELETE FROM DisputeMessage WHERE DisputeId IN (SELECT Id FROM @DisputeIds) OR SenderId IN (SELECT Id FROM @UserIds);
DELETE FROM DisputeStatusHistory WHERE DisputeId IN (SELECT Id FROM @DisputeIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM DisputeDecision WHERE DisputeId IN (SELECT Id FROM @DisputeIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM Disputes WHERE Id IN (SELECT Id FROM @DisputeIds);

DELETE FROM ReviewModerationRecord WHERE TeacherReviewId IN (SELECT Id FROM @ReviewIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherReviews WHERE Id IN (SELECT Id FROM @ReviewIds);

/* Finance */
DELETE FROM CouponRedemptions
WHERE StudentId IN (SELECT Id FROM @UserIds) OR PaymentId IN (SELECT Id FROM @PaymentIds);
DELETE FROM EscrowEntries
WHERE PaymentId IN (SELECT Id FROM @PaymentIds)
   OR OrderId IN (SELECT Id FROM @OrderIds)
   OR LiveSessionBookingId IN (SELECT Id FROM @BookingIds);
DELETE FROM Refunds
WHERE ActorId IN (SELECT Id FROM @UserIds)
   OR PaymentId IN (SELECT Id FROM @PaymentIds)
   OR OrderId IN (SELECT Id FROM @OrderIds);
DELETE FROM PaymentAttempts WHERE PaymentId IN (SELECT Id FROM @PaymentIds);
DELETE FROM Payments WHERE Id IN (SELECT Id FROM @PaymentIds);
DELETE FROM WithdrawalRequests WHERE TeacherId IN (SELECT Id FROM @UserIds);
DELETE FROM LedgerEntries
WHERE DebitAccountId IN (SELECT Id FROM @LedgerAccountIds)
   OR CreditAccountId IN (SELECT Id FROM @LedgerAccountIds);
DELETE FROM LedgerAccounts WHERE Id IN (SELECT Id FROM @LedgerAccountIds);
DELETE FROM FinancialAuditRecords WHERE ActorId IN (SELECT Id FROM @UserIds);

/* Live sessions */
DELETE FROM LiveSessionAttachments
WHERE LiveSessionBookingId IN (SELECT Id FROM @BookingIds) OR UploadedById IN (SELECT Id FROM @UserIds);
DELETE FROM LiveSessionStatusHistory WHERE LiveSessionBookingId IN (SELECT Id FROM @BookingIds);
DELETE FROM LiveSessionBookings WHERE Id IN (SELECT Id FROM @BookingIds);

/* Orders / requests */
DELETE FROM OrderDeliveries WHERE OrderId IN (SELECT Id FROM @OrderIds);
DELETE FROM RevisionRequest WHERE OrderId IN (SELECT Id FROM @OrderIds);
DELETE FROM OrderStatusHistory WHERE OrderId IN (SELECT Id FROM @OrderIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM Orders WHERE Id IN (SELECT Id FROM @OrderIds);

DELETE FROM LearningRequestAttachments WHERE LearningRequestId IN (SELECT Id FROM @RequestIds);
DELETE FROM RequestClarification WHERE LearningRequestId IN (SELECT Id FROM @RequestIds) OR SenderId IN (SELECT Id FROM @UserIds);
DELETE FROM LearningRequestStatusHistory WHERE LearningRequestId IN (SELECT Id FROM @RequestIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM LearningRequests WHERE Id IN (SELECT Id FROM @RequestIds);

/* Messaging / notifications */
DELETE FROM NotificationOutbox WHERE NotificationId IN (SELECT Id FROM @NotificationIds);
DELETE FROM Notifications WHERE Id IN (SELECT Id FROM @NotificationIds);
DELETE FROM UserNotificationPreferences WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM MessageAttachments WHERE MessageId IN (SELECT Id FROM @MessageIds);
DELETE FROM Messages WHERE Id IN (SELECT Id FROM @MessageIds);
DELETE FROM ConversationParticipant
WHERE UserId IN (SELECT Id FROM @UserIds)
   OR ConversationId IN (SELECT Id FROM @ConversationIds);
DELETE FROM Conversations WHERE Id IN (SELECT Id FROM @ConversationIds);

/* Teacher marketplace / applications */
DELETE FROM TeacherEvaluationScore
WHERE TeacherApplicationReviewId IN (
  SELECT Id FROM TeacherApplicationReview WHERE TeacherApplicationId IN (SELECT Id FROM @AppIds)
);
DELETE FROM TeacherApplicationReview WHERE TeacherApplicationId IN (SELECT Id FROM @AppIds);
DELETE FROM TeacherApplicationStatusHistory
WHERE TeacherApplicationId IN (SELECT Id FROM @AppIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherDemoSubmissions
WHERE TeacherId IN (SELECT Id FROM @UserIds) OR TeacherApplicationId IN (SELECT Id FROM @AppIds);
DELETE FROM TeacherSubjectQualifications WHERE TeacherId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherApplications WHERE Id IN (SELECT Id FROM @AppIds);

DELETE FROM FavoriteTeachers
WHERE StudentId IN (SELECT Id FROM @UserIds) OR TeacherId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherTeachingSamples WHERE TeacherId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherAvailabilityExceptions WHERE TeacherId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherAvailabilityRules WHERE TeacherId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherCredential WHERE TeacherId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherEducationLevels WHERE TeacherId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherLanguages WHERE TeacherId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherTopics WHERE TeacherId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherServices WHERE Id IN (SELECT Id FROM @ServiceIds);
DELETE FROM TeacherProfiles WHERE TeacherId IN (SELECT Id FROM @UserIds);

/* Audit */
DELETE FROM AuditLogEntries WHERE ActorId IN (SELECT Id FROM @UserIds);

/* Identity */
DELETE FROM RefreshTokens WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM AspNetUserClaims WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM AspNetUserLogins WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM AspNetUserTokens WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM AspNetUserRoles WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM AspNetUsers WHERE Id IN (SELECT Id FROM @UserIds);

COMMIT TRANSACTION;

SELECT 'Deleted users' AS Result, COUNT(*) AS Remaining
FROM AspNetUsers
WHERE Id IN (SELECT Id FROM #Users);
