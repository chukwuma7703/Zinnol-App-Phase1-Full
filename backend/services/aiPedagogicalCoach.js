/**
 * AI Pedagogical Coach Service
 * 
 * Provides real-time, personalized teaching feedback using AI analysis
 * Transforms daily session notes into professional development opportunities
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import logger from '../utils/logger.js';
import Notification from '../models/Notification.js';
import User from '../models/userModel.js';
import TeacherActivity from '../models/teacherActivityModel.js';
import { trackBusinessEvent } from '../config/monitoring.js';

/**
 * AI Provider Interface
 */
class AIProvider {
  async generateFeedback(prompt) {
    throw new Error('Method must be implemented by subclass');
  }
}

/**
 * Google Gemini Provider
 */
class GeminiProvider extends AIProvider {
  constructor() {
    super();
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Primary (newer) model
    let modelName = "gemini-2.0-flash-exp";

    // If free tier or error, fallback to older but free-compatible
    try {
      this.model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      });
      logger.info(`Gemini provider initialized with ${modelName}`);
    } catch (err) {
      logger.warn(
        `Failed to load ${modelName}, falling back to gemini-1.5-flash (free tier)`
      );
      modelName = "gemini-1.5-flash";
      this.model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      });
      logger.info(`Gemini provider initialized with ${modelName} (fallback)`);
    }
  }

  async generateFeedback(prompt) {
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      logger.error('Gemini API error:', error);
      throw error;
    }
  }
}

/**
 * OpenAI GPT Provider
 */
class OpenAIProvider extends AIProvider {
  constructor() {
    super();
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateFeedback(prompt) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are an expert pedagogical coach with 20+ years of experience in education. Provide constructive, actionable feedback to help teachers improve their practice."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      return completion.choices[0].message.content;
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw error;
    }
  }
}

/**
 * Main AI Pedagogical Coach Service
 */
class AIPedagogicalCoach {
  constructor() {
    // Select AI provider based on configuration
    const provider = process.env.AI_PROVIDER || 'gemini';

    try {
      if (provider === 'openai') {
        this.aiProvider = new OpenAIProvider();
      } else {
        this.aiProvider = new GeminiProvider();
      }
      logger.info(`AI Pedagogical Coach initialized with ${provider} provider`);
    } catch (error) {
      logger.warn(`AI Provider initialization failed: ${error.message}`);
      this.aiProvider = null;
    }

    // Feedback templates for consistency
    this.feedbackTemplates = {
      engagement: {
        high: [
          "Excellent student engagement! Your interactive approach is working well.",
          "Great job maintaining high engagement throughout the session!",
          "Your students were clearly invested in the lesson - well done!"
        ],
        low: [
          "Consider incorporating more interactive elements to boost engagement.",
          "Try using think-pair-share activities to increase participation.",
          "Breaking content into smaller chunks with activities might help engagement."
        ]
      },
      difficulty: {
        identified: "Excellent awareness in identifying challenging concepts for students.",
        suggestions: [
          "Consider using visual aids or manipulatives for complex topics.",
          "Breaking down difficult concepts into smaller steps can help.",
          "Peer teaching can be effective for challenging material."
        ]
      }
    };

    // Resource library
    this.resources = {
      'differentiation': [
        { title: 'Differentiated Instruction Strategies', url: 'https://example.com/diff-strategies', duration: '5 min' },
        { title: 'Tiered Assignments Guide', url: 'https://example.com/tiered-assignments', duration: '10 min' }
      ],
      'engagement': [
        { title: 'Active Learning Techniques', url: 'https://example.com/active-learning', duration: '7 min' },
        { title: 'Gamification in Education', url: 'https://example.com/gamification', duration: '15 min' }
      ],
      'assessment': [
        { title: 'Formative Assessment Strategies', url: 'https://example.com/formative', duration: '8 min' },
        { title: 'Quick Check Techniques', url: 'https://example.com/quick-checks', duration: '5 min' }
      ],
      'classroom_management': [
        { title: 'Positive Behavior Support', url: 'https://example.com/pbs', duration: '12 min' },
        { title: 'Classroom Routines That Work', url: 'https://example.com/routines', duration: '10 min' }
      ],
      'technology': [
        { title: 'EdTech Tools for Engagement', url: 'https://example.com/edtech', duration: '10 min' },
        { title: 'Digital Assessment Tools', url: 'https://example.com/digital-assessment', duration: '8 min' }
      ]
    };
  }

  /**
   * Analyze teacher's feedback note and generate AI coaching
   */
  async analyzeFeedbackNote(activityId) {
    try {
      // Fetch the activity with related data
      const activity = await TeacherActivity.findById(activityId)
        .populate('teacher', 'name email')
        .populate('subject', 'name')
        .populate('classroom', 'name level');

      if (!activity || !activity.feedbackNote) {
        throw new Error('Activity or feedback note not found');
      }

      // Extract key information
      const analysis = await this.performAnalysis(activity);

      // Generate AI feedback if provider is available
      let aiFeedback = null;
      if (this.aiProvider) {
        aiFeedback = await this.generateAIFeedback(activity, analysis);
      }

      // Generate structured feedback
      const feedback = this.generateStructuredFeedback(activity, analysis, aiFeedback);

      // Store feedback
      await this.storeFeedback(activity, feedback);

      // Send notification to teacher
      await this.notifyTeacher(activity.teacher, feedback);

      // Track analytics
      trackBusinessEvent('ai_coaching_generated');

      return feedback;

    } catch (error) {
      logger.error('Error analyzing feedback note:', error);
      throw error;
    }
  }

  /**
   * Perform initial analysis of the feedback note
   */
  async performAnalysis(activity) {
    const { feedbackNote } = activity;
    const analysis = {
      wordCount: feedbackNote.split(/\s+/).length,
      sentiment: this.analyzeSentiment(feedbackNote),
      topics: this.extractTopics(feedbackNote),
      challenges: this.identifyChallenges(feedbackNote),
      successes: this.identifySuccesses(feedbackNote),
      studentMentions: this.countStudentMentions(feedbackNote),
      actionItems: this.extractActionItems(feedbackNote)
    };

    return analysis;
  }

  /**
   * Analyze sentiment of the feedback
   */
  analyzeSentiment(text) {
    const positiveWords = ['excellent', 'great', 'good', 'engaged', 'understood', 'successful', 'improved', 'active', 'participated'];
    const negativeWords = ['struggled', 'difficult', 'challenging', 'confused', 'lost', 'disengaged', 'problem', 'issue'];

    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;

    words.forEach(word => {
      if (positiveWords.some(pw => word.includes(pw))) positiveCount++;
      if (negativeWords.some(nw => word.includes(nw))) negativeCount++;
    });

    const total = positiveCount + negativeCount || 1;
    const sentiment = (positiveCount - negativeCount) / total;

    return {
      score: sentiment,
      label: sentiment > 0.3 ? 'positive' : sentiment < -0.3 ? 'negative' : 'neutral',
      positive: positiveCount,
      negative: negativeCount
    };
  }

  /**
   * Extract main topics from the feedback
   */
  extractTopics(text) {
    const topics = [];
    const topicKeywords = {
      engagement: ['engaged', 'participation', 'active', 'involved', 'interested'],
      understanding: ['understood', 'grasped', 'comprehend', 'clear', 'confused'],
      behavior: ['behavior', 'discipline', 'disruption', 'focused', 'attention'],
      difficulty: ['difficult', 'challenging', 'struggle', 'hard', 'complex'],
      homework: ['homework', 'assignment', 'practice', 'exercise'],
      assessment: ['test', 'quiz', 'assessment', 'evaluation', 'grade']
    };

    const lowerText = text.toLowerCase();
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        topics.push(topic);
      }
    });

    return topics;
  }

  /**
   * Identify challenges mentioned
   */
  identifyChallenges(text) {
    const challenges = [];
    const challengePatterns = [
      /struggled with (.+?)(?:\.|,|;|$)/gi,
      /found (.+?) (?:difficult|challenging|hard)/gi,
      /had (?:trouble|difficulty|problems) with (.+?)(?:\.|,|;|$)/gi,
      /(.+?) was (?:difficult|challenging|confusing)/gi
    ];

    challengePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        challenges.push(match[1].trim());
      }
    });

    return challenges;
  }

  /**
   * Identify successes mentioned
   */
  identifySuccesses(text) {
    const successes = [];
    const successPatterns = [
      /students (?:understood|grasped|mastered) (.+?)(?:\.|,|;|$)/gi,
      /(.+?) went (?:well|great|excellent)/gi,
      /successful (?:in|with) (.+?)(?:\.|,|;|$)/gi,
      /excellent (?:understanding|grasp) of (.+?)(?:\.|,|;|$)/gi
    ];

    successPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        successes.push(match[1].trim());
      }
    });

    return successes;
  }

  /**
   * Count student mentions
   */
  countStudentMentions(text) {
    const patterns = [
      /\d+ students?/gi,
      /(?:all|most|some|few|many) students/gi,
      /the class/gi
    ];

    let count = 0;
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) count += matches.length;
    });

    return count;
  }

  /**
   * Extract action items
   */
  extractActionItems(text) {
    const actionItems = [];
    const actionPatterns = [
      /(?:will|plan to|need to|should|must) (.+?)(?:\.|,|;|$)/gi,
      /next (?:class|session|time)[,:]? (.+?)(?:\.|,|;|$)/gi,
      /(?:follow up|review|revisit) (.+?)(?:\.|,|;|$)/gi
    ];

    actionPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        actionItems.push(match[1].trim());
      }
    });

    return actionItems;
  }

  /**
   * Generate AI feedback using the configured provider
   */
  async generateAIFeedback(activity, analysis) {
    if (!this.aiProvider) {
      return null;
    }

    const prompt = this.buildAIPrompt(activity, analysis);

    try {
      const feedback = await this.aiProvider.generateFeedback(prompt);
      return this.parseAIResponse(feedback);
    } catch (error) {
      logger.error('AI feedback generation failed:', error);
      return null;
    }
  }

  /**
   * Build prompt for AI
   */
  buildAIPrompt(activity, analysis) {
    return `
As an expert pedagogical coach, analyze this teaching session and provide constructive feedback:

CONTEXT:
- Subject: ${activity.subject.name}
- Class: ${activity.classroom.name} (${activity.classroom.level})
- Duration: ${activity.durationInMinutes} minutes
- Topic: ${activity.topic}

TEACHER'S REFLECTION:
"${activity.feedbackNote}"

ANALYSIS:
- Sentiment: ${analysis.sentiment.label}
- Main topics: ${analysis.topics.join(', ')}
- Challenges identified: ${analysis.challenges.join(', ') || 'None explicitly mentioned'}
- Successes: ${analysis.successes.join(', ') || 'None explicitly mentioned'}

Please provide:
1. STRENGTHS (2-3 specific things the teacher did well)
2. GROWTH AREAS (2-3 specific areas for improvement)
3. ACTIONABLE SUGGESTIONS (3-4 concrete strategies they can implement immediately)
4. RESOURCES (2-3 specific teaching techniques or approaches relevant to their challenges)

Keep the tone supportive, professional, and constructive. Focus on practical, implementable advice.
Format the response in clear sections.`;
  }

  /**
   * Parse AI response into structured format
   */
  parseAIResponse(response) {
    // Simple parsing - in production, use more sophisticated NLP
    const sections = {
      strengths: [],
      growthAreas: [],
      suggestions: [],
      resources: []
    };

    const lines = response.split('\n');
    let currentSection = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().includes('strength')) {
        currentSection = 'strengths';
      } else if (trimmed.toLowerCase().includes('growth') || trimmed.toLowerCase().includes('improvement')) {
        currentSection = 'growthAreas';
      } else if (trimmed.toLowerCase().includes('suggestion') || trimmed.toLowerCase().includes('strateg')) {
        currentSection = 'suggestions';
      } else if (trimmed.toLowerCase().includes('resource')) {
        currentSection = 'resources';
      } else if (currentSection && trimmed.length > 0 && !trimmed.match(/^[\d\-\*\.]+$/)) {
        sections[currentSection].push(trimmed.replace(/^[\d\-\*\.]+ ?/, ''));
      }
    });

    return sections;
  }

  /**
   * Generate structured feedback combining analysis and AI insights
   */
  generateStructuredFeedback(activity, analysis, aiFeedback) {
    const feedback = {
      sessionId: activity._id,
      teacherId: activity.teacher._id,
      timestamp: new Date(),

      // Session summary
      summary: {
        subject: activity.subject.name,
        topic: activity.topic,
        duration: activity.durationInMinutes,
        classroom: activity.classroom.name,
        sentiment: analysis.sentiment.label,
        overallScore: this.calculateOverallScore(analysis)
      },

      // Positive reinforcement
      strengths: aiFeedback?.strengths || this.generateDefaultStrengths(analysis),

      // Areas for growth
      growthAreas: aiFeedback?.growthAreas || this.generateDefaultGrowthAreas(analysis),

      // Actionable suggestions
      suggestions: aiFeedback?.suggestions || this.generateDefaultSuggestions(analysis),

      // Personalized resources
      resources: this.selectRelevantResources(analysis, aiFeedback),

      // Follow-up actions
      followUp: {
        actionItems: analysis.actionItems,
        checkInDate: this.calculateCheckInDate(),
        priority: this.determinePriority(analysis)
      },

      // Metrics for tracking
      metrics: {
        engagementLevel: this.estimateEngagement(analysis),
        challengesAddressed: analysis.challenges.length,
        successesIdentified: analysis.successes.length,
        reflectionQuality: this.assessReflectionQuality(analysis)
      }
    };

    return feedback;
  }

  /**
   * Calculate overall score
   */
  calculateOverallScore(analysis) {
    let score = 50; // Base score

    // Positive factors
    score += analysis.sentiment.positive * 2;
    score += analysis.successes.length * 5;
    score += analysis.actionItems.length * 3;

    // Negative factors
    score -= analysis.sentiment.negative * 2;
    score -= analysis.challenges.length * 2;

    // Normalize to 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate default strengths if AI is unavailable
   */
  generateDefaultStrengths(analysis) {
    const strengths = [];

    if (analysis.sentiment.label === 'positive') {
      strengths.push("Your positive reflection shows strong self-awareness and professional growth mindset.");
    }

    if (analysis.successes.length > 0) {
      strengths.push(`Excellent job identifying successful elements: ${analysis.successes[0]}`);
    }

    if (analysis.actionItems.length > 0) {
      strengths.push("Great forward planning with clear action items for improvement.");
    }

    if (analysis.studentMentions > 3) {
      strengths.push("Strong focus on student-centered teaching and individual needs.");
    }

    return strengths.length > 0 ? strengths : ["Completed thorough session reflection", "Demonstrated commitment to continuous improvement"];
  }

  /**
   * Generate default growth areas
   */
  generateDefaultGrowthAreas(analysis) {
    const areas = [];

    if (analysis.challenges.length > 2) {
      areas.push("Consider focusing on 1-2 key challenges at a time for more targeted improvement.");
    }

    if (analysis.sentiment.label === 'negative') {
      areas.push("Try to balance challenge identification with recognition of successes.");
    }

    if (analysis.studentMentions < 2) {
      areas.push("Consider including more specific student observations in reflections.");
    }

    if (analysis.actionItems.length === 0) {
      areas.push("Develop specific action plans for addressing identified challenges.");
    }

    return areas.length > 0 ? areas : ["Continue developing reflective practice", "Explore new teaching strategies"];
  }

  /**
   * Generate default suggestions
   */
  generateDefaultSuggestions(analysis) {
    const suggestions = [];

    analysis.challenges.forEach(challenge => {
      if (challenge.toLowerCase().includes('engagement')) {
        suggestions.push("Try the 'Think-Pair-Share' technique to boost engagement in the next session.");
      } else if (challenge.toLowerCase().includes('understanding')) {
        suggestions.push("Use concept mapping to help students visualize connections between ideas.");
      } else if (challenge.toLowerCase().includes('time')) {
        suggestions.push("Consider using a timer and clear transitions between activities.");
      }
    });

    if (suggestions.length === 0) {
      suggestions.push(
        "Implement a 'exit ticket' strategy to gauge student understanding",
        "Try incorporating more visual aids or hands-on activities",
        "Consider peer teaching for complex topics"
      );
    }

    return suggestions;
  }

  /**
   * Select relevant resources
   */
  selectRelevantResources(analysis, aiFeedback) {
    const selectedResources = [];
    const topics = analysis.topics;

    // Select resources based on identified topics
    topics.forEach(topic => {
      if (this.resources[topic]) {
        selectedResources.push(...this.resources[topic].slice(0, 2));
      }
    });

    // Add resources for challenges
    if (analysis.challenges.length > 0) {
      if (this.resources.differentiation) {
        selectedResources.push(this.resources.differentiation[0]);
      }
    }

    // Limit to 5 resources
    return selectedResources.slice(0, 5);
  }

  /**
   * Calculate check-in date
   */
  calculateCheckInDate() {
    const date = new Date();
    date.setDate(date.getDate() + 7); // Check in after 1 week
    return date;
  }

  /**
   * Determine priority level
   */
  determinePriority(analysis) {
    if (analysis.challenges.length > 3 || analysis.sentiment.score < -0.5) {
      return 'high';
    } else if (analysis.challenges.length > 1 || analysis.sentiment.score < 0) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Estimate engagement level
   */
  estimateEngagement(analysis) {
    const text = analysis.topics.join(' ');
    if (text.includes('engagement')) {
      if (analysis.sentiment.score > 0) return 'high';
      if (analysis.sentiment.score < 0) return 'low';
    }
    return 'moderate';
  }

  /**
   * Assess reflection quality
   */
  assessReflectionQuality(analysis) {
    let quality = 0;

    // Word count (100+ words required, bonus for more detail)
    if (analysis.wordCount >= 100) quality += 25;
    if (analysis.wordCount >= 150) quality += 10;
    if (analysis.wordCount >= 200) quality += 5;

    // Specific observations
    if (analysis.studentMentions > 0) quality += 15;
    if (analysis.challenges.length > 0) quality += 15;
    if (analysis.successes.length > 0) quality += 15;
    if (analysis.actionItems.length > 0) quality += 15;

    return Math.min(100, quality);
  }

  /**
   * Store feedback in database
   */
  async storeFeedback(activity, feedback) {
    // Add feedback to the activity record
    activity.aiCoachingFeedback = feedback;
    activity.coachingGeneratedAt = new Date();
    await activity.save();

    logger.info(`AI coaching feedback stored for activity ${activity._id}`);
  }

  /**
   * Send notification to teacher
   */
  async notifyTeacher(teacher, feedback) {
    // Create in-app notification
    const notification = new Notification({
      recipient: teacher._id,
      type: 'AI_COACHING',
      title: '🎯 Your Personalized Teaching Insights',
      message: this.formatNotificationMessage(feedback),
      priority: feedback.followUp.priority,
      data: {
        feedbackId: feedback.sessionId,
        strengths: feedback.strengths.slice(0, 2),
        topSuggestion: feedback.suggestions[0],
        resources: feedback.resources.slice(0, 2)
      },
      actionUrl: `/teaching/feedback/${feedback.sessionId}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });

    await notification.save();

    // Send email if high priority
    if (feedback.followUp.priority === 'high') {
      await this.sendEmailNotification(teacher, feedback);
    }

    logger.info(`Teacher ${teacher._id} notified of AI coaching feedback`);
  }

  /**
   * Format notification message
   */
  formatNotificationMessage(feedback) {
    const score = feedback.summary.overallScore;
    let message = '';

    if (score >= 80) {
      message = '🌟 Excellent session! ';
    } else if (score >= 60) {
      message = '👍 Good session! ';
    } else {
      message = '💡 Growth opportunity identified. ';
    }

    message += `Your ${feedback.summary.subject} session on "${feedback.summary.topic}" has been analyzed. `;

    if (feedback.strengths.length > 0) {
      message += `Key strength: ${feedback.strengths[0]} `;
    }

    if (feedback.suggestions.length > 0) {
      message += `Top tip: ${feedback.suggestions[0]}`;
    }

    return message;
  }

  /**
   * Send email notification for high-priority feedback
   */
  async sendEmailNotification(teacher, feedback) {
    // Implementation would integrate with your email service
    logger.info(`Email notification queued for teacher ${teacher.email}`);
  }

  /**
   * Get coaching history for a teacher
   */
  async getCoachingHistory(teacherId, limit = 10) {
    const activities = await TeacherActivity.find({
      teacher: teacherId,
      aiCoachingFeedback: { $exists: true }
    })
      .sort({ coachingGeneratedAt: -1 })
      .limit(limit)
      .select('topic subject classroom aiCoachingFeedback coachingGeneratedAt');

    return activities.map(activity => ({
      id: activity._id,
      date: activity.coachingGeneratedAt,
      topic: activity.topic,
      subject: activity.subject,
      feedback: activity.aiCoachingFeedback
    }));
  }

  /**
   * Get coaching analytics for school
   */
  async getSchoolCoachingAnalytics(schoolId, dateRange) {
    const match = {
      school: schoolId,
      aiCoachingFeedback: { $exists: true }
    };

    if (dateRange) {
      match.coachingGeneratedAt = {
        $gte: dateRange.start,
        $lte: dateRange.end
      };
    }

    const analytics = await TeacherActivity.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          avgScore: { $avg: '$aiCoachingFeedback.summary.overallScore' },
          avgEngagement: {
            $avg: {
              $switch: {
                branches: [
                  { case: { $eq: ['$aiCoachingFeedback.metrics.engagementLevel', 'high'] }, then: 3 },
                  { case: { $eq: ['$aiCoachingFeedback.metrics.engagementLevel', 'moderate'] }, then: 2 },
                  { case: { $eq: ['$aiCoachingFeedback.metrics.engagementLevel', 'low'] }, then: 1 }
                ],
                default: 2
              }
            }
          },
          totalChallenges: { $sum: '$aiCoachingFeedback.metrics.challengesAddressed' },
          totalSuccesses: { $sum: '$aiCoachingFeedback.metrics.successesIdentified' }
        }
      }
    ]);

    return analytics[0] || {
      totalSessions: 0,
      avgScore: 0,
      avgEngagement: 0,
      totalChallenges: 0,
      totalSuccesses: 0
    };
  }
}

// Export the class (not singleton instance)
export default AIPedagogicalCoach;