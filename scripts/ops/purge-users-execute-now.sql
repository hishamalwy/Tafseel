/*
  EXECUTE NOW — hard-delete the 11 non-demo staging users.
  Keeps: admin@, student@, quality@, teacher@gmail.com

  After success, Remaining must be 0 and AspNetUsers total should be 4.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @UserIds TABLE (Id nvarchar(450) PRIMARY KEY);
INSERT INTO @UserIds (Id) VALUES
  (N'1603e52a-dcd6-4115-9bdd-9570cf7dbdf8'),
  (N'1b31846e-54ea-4ce4-b57f-bb812f87dbf4'),
  (N'2f693139-5c7a-4e86-8589-62dc1a66eea3'),
  (N'32e1c534-4fd4-4ae3-a882-4b603bf7fe60'),
  (N'41abe1d2-3800-4610-b711-d1636dbdea24'),
  (N'65291504-78c1-4a60-b53c-eeb71d1d5a9c'),
  (N'7a89eeda-94d5-4d84-9768-a94f842b11f9'),
  (N'dbd52be5-aa85-4840-85bd-365e20aae6b2'),
  (N'dfefb90b-60b5-46bb-ab89-a434be8f995a'),
  (N'e5d882df-7425-4904-90bf-2def3bf2fef0'),
  (N'f7338002-1538-4b71-a187-06cdddc164be');

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

DELETE FROM DisputeEvidence WHERE DisputeId IN (SELECT Id FROM @DisputeIds) OR UploadedById IN (SELECT Id FROM @UserIds);
DELETE FROM DisputeMessage WHERE DisputeId IN (SELECT Id FROM @DisputeIds) OR SenderId IN (SELECT Id FROM @UserIds);
DELETE FROM DisputeStatusHistory WHERE DisputeId IN (SELECT Id FROM @DisputeIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM DisputeDecision WHERE DisputeId IN (SELECT Id FROM @DisputeIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM Disputes WHERE Id IN (SELECT Id FROM @DisputeIds);

DELETE FROM ReviewModerationRecord WHERE TeacherReviewId IN (SELECT Id FROM @ReviewIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM TeacherReviews WHERE Id IN (SELECT Id FROM @ReviewIds);

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

DELETE FROM LiveSessionAttachments
WHERE LiveSessionBookingId IN (SELECT Id FROM @BookingIds) OR UploadedById IN (SELECT Id FROM @UserIds);
DELETE FROM LiveSessionStatusHistory WHERE LiveSessionBookingId IN (SELECT Id FROM @BookingIds);
DELETE FROM LiveSessionBookings WHERE Id IN (SELECT Id FROM @BookingIds);

DELETE FROM OrderDeliveries WHERE OrderId IN (SELECT Id FROM @OrderIds);
DELETE FROM RevisionRequest WHERE OrderId IN (SELECT Id FROM @OrderIds);
DELETE FROM OrderStatusHistory WHERE OrderId IN (SELECT Id FROM @OrderIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM Orders WHERE Id IN (SELECT Id FROM @OrderIds);

DELETE FROM LearningRequestAttachments WHERE LearningRequestId IN (SELECT Id FROM @RequestIds);
DELETE FROM RequestClarification WHERE LearningRequestId IN (SELECT Id FROM @RequestIds) OR SenderId IN (SELECT Id FROM @UserIds);
DELETE FROM LearningRequestStatusHistory WHERE LearningRequestId IN (SELECT Id FROM @RequestIds) OR ActorId IN (SELECT Id FROM @UserIds);
DELETE FROM LearningRequests WHERE Id IN (SELECT Id FROM @RequestIds);

DELETE FROM NotificationOutbox WHERE NotificationId IN (SELECT Id FROM @NotificationIds);
DELETE FROM Notifications WHERE Id IN (SELECT Id FROM @NotificationIds);
DELETE FROM UserNotificationPreferences WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM MessageAttachments WHERE MessageId IN (SELECT Id FROM @MessageIds);
DELETE FROM Messages WHERE Id IN (SELECT Id FROM @MessageIds);
DELETE FROM ConversationParticipant
WHERE UserId IN (SELECT Id FROM @UserIds)
   OR ConversationId IN (SELECT Id FROM @ConversationIds);
DELETE FROM Conversations WHERE Id IN (SELECT Id FROM @ConversationIds);

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

DELETE FROM AuditLogEntries WHERE ActorId IN (SELECT Id FROM @UserIds);

DELETE FROM RefreshTokens WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM AspNetUserClaims WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM AspNetUserLogins WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM AspNetUserTokens WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM AspNetUserRoles WHERE UserId IN (SELECT Id FROM @UserIds);
DELETE FROM AspNetUsers WHERE Id IN (SELECT Id FROM @UserIds);

COMMIT TRANSACTION;

SELECT 'Remaining deleted targets' AS CheckName, COUNT(*) AS Cnt
FROM AspNetUsers WHERE Id IN (SELECT Id FROM @UserIds)
UNION ALL
SELECT 'Total AspNetUsers', COUNT(*) FROM AspNetUsers
UNION ALL
SELECT 'Demo users kept', COUNT(*) FROM AspNetUsers
WHERE Email IN (N'admin@gmail.com', N'student@gmail.com', N'quality@gmail.com', N'teacher@gmail.com');

SELECT Id, Email, FullName, EmailConfirmed
FROM AspNetUsers
ORDER BY Email;
