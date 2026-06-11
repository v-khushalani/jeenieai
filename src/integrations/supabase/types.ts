export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      _backup_questions_chapter_reconcile: {
        Row: {
          backed_up_at: string | null
          old_batch_id: string | null
          old_chapter: string | null
          old_subject: string | null
          question_id: string
        }
        Insert: {
          backed_up_at?: string | null
          old_batch_id?: string | null
          old_chapter?: string | null
          old_subject?: string | null
          question_id: string
        }
        Update: {
          backed_up_at?: string | null
          old_batch_id?: string | null
          old_chapter?: string | null
          old_subject?: string | null
          question_id?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          body: string
          created_at: string | null
          created_by: string | null
          id: string
          message: string | null
          scheduled_at: string | null
          scheduled_for: string | null
          sent_at: string | null
          sent_by: string | null
          status: string | null
          target_audience: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          message?: string | null
          scheduled_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          target_audience?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          message?: string | null
          scheduled_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          target_audience?: string | null
          title?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          category: string | null
          code: string
          color: string | null
          created_at: string | null
          criteria: Json | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          points_required: number | null
          points_reward: number | null
          tier: string | null
        }
        Insert: {
          category?: string | null
          code: string
          color?: string | null
          created_at?: string | null
          criteria?: Json | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          points_required?: number | null
          points_reward?: number | null
          tier?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          color?: string | null
          created_at?: string | null
          criteria?: Json | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          points_required?: number | null
          points_reward?: number | null
          tier?: string | null
        }
        Relationships: []
      }
      batch_subjects: {
        Row: {
          batch_id: string
          created_at: string | null
          display_order: number | null
          id: string
          subject: string
        }
        Insert: {
          batch_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          subject: string
        }
        Update: {
          batch_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_subjects_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          exam_type: string
          grade: number
          id: string
          is_active: boolean | null
          is_free: boolean | null
          name: string
          offer_price: number | null
          price: number | null
          slug: string | null
          updated_at: string | null
          validity_days: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          exam_type: string
          grade: number
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name: string
          offer_price?: number | null
          price?: number | null
          slug?: string | null
          updated_at?: string | null
          validity_days?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          exam_type?: string
          grade?: number
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name?: string
          offer_price?: number | null
          price?: number | null
          slug?: string | null
          updated_at?: string | null
          validity_days?: number | null
        }
        Relationships: []
      }
      battle_answers: {
        Row: {
          answered_at: string
          battle_id: string
          id: string
          is_correct: boolean
          numerical_answer: number | null
          points: number
          question_id: string
          selected_options: string[] | null
          user_id: string
        }
        Insert: {
          answered_at?: string
          battle_id: string
          id?: string
          is_correct?: boolean
          numerical_answer?: number | null
          points?: number
          question_id: string
          selected_options?: string[] | null
          user_id: string
        }
        Update: {
          answered_at?: string
          battle_id?: string
          id?: string
          is_correct?: boolean
          numerical_answer?: number | null
          points?: number
          question_id?: string
          selected_options?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_answers_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battle_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_players: {
        Row: {
          battle_id: string
          correct_count: number
          display_name: string | null
          finished_at: string | null
          id: string
          joined_at: string
          score: number
          streak: number
          user_id: string
          wrong_count: number
        }
        Insert: {
          battle_id: string
          correct_count?: number
          display_name?: string | null
          finished_at?: string | null
          id?: string
          joined_at?: string
          score?: number
          streak?: number
          user_id: string
          wrong_count?: number
        }
        Update: {
          battle_id?: string
          correct_count?: number
          display_name?: string | null
          finished_at?: string | null
          id?: string
          joined_at?: string
          score?: number
          streak?: number
          user_id?: string
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_players_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battle_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_rewards: {
        Row: {
          battle_id: string
          claimed_at: string | null
          created_at: string
          id: string
          points: number
          reward_type: string
          title: string
          user_id: string
        }
        Insert: {
          battle_id: string
          claimed_at?: string | null
          created_at?: string
          id?: string
          points?: number
          reward_type?: string
          title?: string
          user_id: string
        }
        Update: {
          battle_id?: string
          claimed_at?: string | null
          created_at?: string
          id?: string
          points?: number
          reward_type?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_rewards_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battle_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_sessions: {
        Row: {
          chapter: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          difficulty: string | null
          expires_at: string
          id: string
          max_players: number
          question_ids: string[]
          started_at: string | null
          status: string
          subject: string | null
          topic_id: string | null
          updated_at: string
          winner_user_id: string | null
        }
        Insert: {
          chapter?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: string | null
          expires_at?: string
          id?: string
          max_players?: number
          question_ids?: string[]
          started_at?: string | null
          status?: string
          subject?: string | null
          topic_id?: string | null
          updated_at?: string
          winner_user_id?: string | null
        }
        Update: {
          chapter?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: string | null
          expires_at?: string
          id?: string
          max_players?: number
          question_ids?: string[]
          started_at?: string | null
          status?: string
          subject?: string | null
          topic_id?: string | null
          updated_at?: string
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "battle_sessions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          batch_id: string | null
          chapter_name: string | null
          chapter_number: number | null
          class_level: number | null
          created_at: string | null
          description: string | null
          exam_relevance: Database["public"]["Enums"]["exam_code"][] | null
          id: string
          is_active: boolean | null
          is_free: boolean | null
          name: string | null
          slug: string | null
          subject: string | null
          subject_id: string | null
          updated_at: string | null
        }
        Insert: {
          batch_id?: string | null
          chapter_name?: string | null
          chapter_number?: number | null
          class_level?: number | null
          created_at?: string | null
          description?: string | null
          exam_relevance?: Database["public"]["Enums"]["exam_code"][] | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name?: string | null
          slug?: string | null
          subject?: string | null
          subject_id?: string | null
          updated_at?: string | null
        }
        Update: {
          batch_id?: string | null
          chapter_name?: string | null
          chapter_number?: number | null
          class_level?: number | null
          created_at?: string | null
          description?: string | null
          exam_relevance?: Database["public"]["Enums"]["exam_code"][] | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name?: string | null
          slug?: string | null
          subject?: string | null
          subject_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_maps: {
        Row: {
          chapter_id: string | null
          created_at: string | null
          created_by: string | null
          edges: Json | null
          id: string
          is_published: boolean | null
          nodes: Json | null
          subject: string | null
          title: string
          topic_id: string | null
          updated_at: string | null
        }
        Insert: {
          chapter_id?: string | null
          created_at?: string | null
          created_by?: string | null
          edges?: Json | null
          id?: string
          is_published?: boolean | null
          nodes?: Json | null
          subject?: string | null
          title: string
          topic_id?: string | null
          updated_at?: string | null
        }
        Update: {
          chapter_id?: string | null
          created_at?: string | null
          created_by?: string | null
          edges?: Json | null
          id?: string
          is_published?: boolean | null
          nodes?: Json | null
          subject?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concept_maps_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_maps_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          topic_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          topic_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concepts_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_prompts: {
        Row: {
          action_taken: string | null
          converted: boolean | null
          id: string
          prompt_type: string
          shown_at: string | null
          user_id: string
        }
        Insert: {
          action_taken?: string | null
          converted?: boolean | null
          id?: string
          prompt_type: string
          shown_at?: string | null
          user_id: string
        }
        Update: {
          action_taken?: string | null
          converted?: boolean | null
          id?: string
          prompt_type?: string
          shown_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_progress: {
        Row: {
          accuracy_7day: number | null
          created_at: string | null
          daily_target: number | null
          date: string
          id: string
          points_earned: number | null
          questions_attempted: number | null
          questions_completed: number | null
          questions_correct: number | null
          target_met: boolean | null
          total_study_time: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accuracy_7day?: number | null
          created_at?: string | null
          daily_target?: number | null
          date: string
          id?: string
          points_earned?: number | null
          questions_attempted?: number | null
          questions_completed?: number | null
          questions_correct?: number | null
          target_met?: boolean | null
          total_study_time?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accuracy_7day?: number | null
          created_at?: string | null
          daily_target?: number | null
          date?: string
          id?: string
          points_earned?: number | null
          questions_attempted?: number | null
          questions_completed?: number | null
          questions_correct?: number | null
          target_met?: boolean | null
          total_study_time?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      educator_content: {
        Row: {
          approval_status: string
          chapter_id: string | null
          content_type: string
          created_at: string | null
          description: string | null
          display_order: number | null
          duration: number | null
          educator_id: string
          embed_url: string | null
          file_path: string | null
          file_url: string | null
          grade: number | null
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          original_filename: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          subject: string | null
          submitted_at: string
          thumbnail_url: string | null
          title: string
          topic_id: string | null
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          approval_status?: string
          chapter_id?: string | null
          content_type: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration?: number | null
          educator_id: string
          embed_url?: string | null
          file_path?: string | null
          file_url?: string | null
          grade?: number | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          original_filename?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          subject?: string | null
          submitted_at?: string
          thumbnail_url?: string | null
          title: string
          topic_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          approval_status?: string
          chapter_id?: string | null
          content_type?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration?: number | null
          educator_id?: string
          embed_url?: string | null
          file_path?: string | null
          file_url?: string | null
          grade?: number | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          original_filename?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          subject?: string | null
          submitted_at?: string
          thumbnail_url?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "educator_content_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "educator_content_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_config: {
        Row: {
          config: Json | null
          exam_code: string
          exam_date: string | null
          exam_name: string
          id: string
          is_active: boolean | null
          registration_deadline: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          exam_code: string
          exam_date?: string | null
          exam_name: string
          id?: string
          is_active?: boolean | null
          registration_deadline?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          exam_code?: string
          exam_date?: string | null
          exam_name?: string
          id?: string
          is_active?: boolean | null
          registration_deadline?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      extracted_questions_queue: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          page_number: number | null
          parsed_question: Json | null
          promoted_question_id: string | null
          raw_data: Json
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_file: string | null
          status: Database["public"]["Enums"]["staging_status"] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          page_number?: number | null
          parsed_question?: Json | null
          promoted_question_id?: string | null
          raw_data: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_file?: string | null
          status?: Database["public"]["Enums"]["staging_status"] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          page_number?: number | null
          parsed_question?: Json | null
          promoted_question_id?: string | null
          raw_data?: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_file?: string | null
          status?: Database["public"]["Enums"]["staging_status"] | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          category: string | null
          config: Json | null
          description: string | null
          flag_key: string
          id: string
          is_enabled: boolean | null
          label: string | null
          rollout_percentage: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          config?: Json | null
          description?: string | null
          flag_key: string
          id?: string
          is_enabled?: boolean | null
          label?: string | null
          rollout_percentage?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          config?: Json | null
          description?: string | null
          flag_key?: string
          id?: string
          is_enabled?: boolean | null
          label?: string | null
          rollout_percentage?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      group_tests: {
        Row: {
          batch_id: string | null
          chapter_names: Json | null
          code: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          ends_at: string | null
          host_id: string | null
          id: string
          is_active: boolean | null
          question_ids: Json | null
          starts_at: string | null
          status: string | null
          subject: string | null
          test_code: string | null
          time_limit: number | null
          title: string | null
        }
        Insert: {
          batch_id?: string | null
          chapter_names?: Json | null
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          host_id?: string | null
          id?: string
          is_active?: boolean | null
          question_ids?: Json | null
          starts_at?: string | null
          status?: string | null
          subject?: string | null
          test_code?: string | null
          time_limit?: number | null
          title?: string | null
        }
        Update: {
          batch_id?: string | null
          chapter_names?: Json | null
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          host_id?: string | null
          id?: string
          is_active?: boolean | null
          question_ids?: Json | null
          starts_at?: string | null
          status?: string | null
          subject?: string | null
          test_code?: string | null
          time_limit?: number | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_tests_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          chapters_created: number | null
          created_at: string | null
          created_by: string | null
          dataset_path: string | null
          error: string | null
          finished_at: string | null
          id: string
          imported: number | null
          options: Json | null
          skip_reasons: Json | null
          skipped: number | null
          source: string | null
          started_at: string | null
          status: string | null
          topics_created: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          chapters_created?: number | null
          created_at?: string | null
          created_by?: string | null
          dataset_path?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          imported?: number | null
          options?: Json | null
          skip_reasons?: Json | null
          skipped?: number | null
          source?: string | null
          started_at?: string | null
          status?: string | null
          topics_created?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          chapters_created?: number | null
          created_at?: string | null
          created_by?: string | null
          dataset_path?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          imported?: number | null
          options?: Json | null
          skip_reasons?: Json | null
          skipped?: number | null
          source?: string | null
          started_at?: string | null
          status?: string | null
          topics_created?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_audit: {
        Row: {
          changed_by_user: string | null
          created_at: string | null
          id: string
          payment_id: string | null
          payment_table: string | null
          razorpay_order_id: string | null
          status_from: string | null
          status_to: string | null
        }
        Insert: {
          changed_by_user?: string | null
          created_at?: string | null
          id?: string
          payment_id?: string | null
          payment_table?: string | null
          razorpay_order_id?: string | null
          status_from?: string | null
          status_to?: string | null
        }
        Update: {
          changed_by_user?: string | null
          created_at?: string | null
          id?: string
          payment_id?: string | null
          payment_table?: string | null
          razorpay_order_id?: string | null
          status_from?: string | null
          status_to?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          batch_id: string | null
          created_at: string | null
          currency: string | null
          discount_applied: number | null
          id: string
          metadata: Json | null
          plan_duration: number | null
          plan_id: string | null
          promo_code_id: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          batch_id?: string | null
          created_at?: string | null
          currency?: string | null
          discount_applied?: number | null
          id?: string
          metadata?: Json | null
          plan_duration?: number | null
          plan_id?: string | null
          promo_code_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          batch_id?: string | null
          created_at?: string | null
          currency?: string | null
          discount_applied?: number | null
          id?: string
          metadata?: Json | null
          plan_duration?: number | null
          plan_id?: string | null
          promo_code_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      points_log: {
        Row: {
          action_type: string
          created_at: string | null
          description: string | null
          id: string
          points: number
          reference_id: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          points: number
          reference_id?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          points?: number
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          badges: Json | null
          city: string | null
          created_at: string | null
          current_streak: number | null
          daily_goal: number | null
          daily_question_limit: number | null
          educator_approved: boolean
          email: string | null
          full_name: string | null
          goal_exam: string | null
          goal_locked: boolean | null
          goal_locked_at: string | null
          grade: number | null
          id: string
          is_premium: boolean | null
          last_activity: string | null
          last_activity_date: string | null
          last_streak_date: string | null
          level: string | null
          level_progress: number | null
          longest_streak: number | null
          onboarding_completed: boolean | null
          overall_accuracy: number | null
          phone: string | null
          questions_today: number | null
          referral_code: string | null
          smart_goal_enabled: boolean | null
          state: string | null
          streak_freeze_available: boolean | null
          subjects: string[] | null
          subscription_end_date: string | null
          subscription_plan: string | null
          subscription_status: string | null
          subscription_tier: string
          target_exam: string | null
          target_exam_date: string | null
          target_rank: number | null
          total_points: number | null
          total_questions_solved: number | null
          total_study_time: number | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          badges?: Json | null
          city?: string | null
          created_at?: string | null
          current_streak?: number | null
          daily_goal?: number | null
          daily_question_limit?: number | null
          educator_approved?: boolean
          email?: string | null
          full_name?: string | null
          goal_exam?: string | null
          goal_locked?: boolean | null
          goal_locked_at?: string | null
          grade?: number | null
          id: string
          is_premium?: boolean | null
          last_activity?: string | null
          last_activity_date?: string | null
          last_streak_date?: string | null
          level?: string | null
          level_progress?: number | null
          longest_streak?: number | null
          onboarding_completed?: boolean | null
          overall_accuracy?: number | null
          phone?: string | null
          questions_today?: number | null
          referral_code?: string | null
          smart_goal_enabled?: boolean | null
          state?: string | null
          streak_freeze_available?: boolean | null
          subjects?: string[] | null
          subscription_end_date?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          target_exam?: string | null
          target_exam_date?: string | null
          target_rank?: number | null
          total_points?: number | null
          total_questions_solved?: number | null
          total_study_time?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          badges?: Json | null
          city?: string | null
          created_at?: string | null
          current_streak?: number | null
          daily_goal?: number | null
          daily_question_limit?: number | null
          educator_approved?: boolean
          email?: string | null
          full_name?: string | null
          goal_exam?: string | null
          goal_locked?: boolean | null
          goal_locked_at?: string | null
          grade?: number | null
          id?: string
          is_premium?: boolean | null
          last_activity?: string | null
          last_activity_date?: string | null
          last_streak_date?: string | null
          level?: string | null
          level_progress?: number | null
          longest_streak?: number | null
          onboarding_completed?: boolean | null
          overall_accuracy?: number | null
          phone?: string | null
          questions_today?: number | null
          referral_code?: string | null
          smart_goal_enabled?: boolean | null
          state?: string | null
          streak_freeze_available?: boolean | null
          subjects?: string[] | null
          subscription_end_date?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          target_exam?: string | null
          target_exam_date?: string | null
          target_rank?: number | null
          total_points?: number | null
          total_questions_solved?: number | null
          total_study_time?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          applicable_plan_ids: string[] | null
          code: string
          created_at: string | null
          current_redemptions: number | null
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_per_user: number | null
          max_redemptions: number | null
          min_amount: number | null
          starts_at: string | null
        }
        Insert: {
          applicable_plan_ids?: string[] | null
          code: string
          created_at?: string | null
          current_redemptions?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_per_user?: number | null
          max_redemptions?: number | null
          min_amount?: number | null
          starts_at?: string | null
        }
        Update: {
          applicable_plan_ids?: string[] | null
          code?: string
          created_at?: string | null
          current_redemptions?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_per_user?: number | null
          max_redemptions?: number | null
          min_amount?: number | null
          starts_at?: string | null
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          created_at: string | null
          discount_applied: number | null
          id: string
          plan_id: string | null
          promo_code_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          discount_applied?: number | null
          id?: string
          plan_id?: string | null
          promo_code_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          discount_applied?: number | null
          id?: string
          plan_id?: string | null
          promo_code_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      question_attempts: {
        Row: {
          attempted_at: string | null
          created_at: string | null
          id: string
          is_correct: boolean | null
          mode: string | null
          points_earned: number | null
          question_id: string
          selected_option: string | null
          selected_options: string[] | null
          test_session_id: string | null
          time_spent: number | null
          user_id: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          mode?: string | null
          points_earned?: number | null
          question_id: string
          selected_option?: string | null
          selected_options?: string[] | null
          test_session_id?: string | null
          time_spent?: number | null
          user_id: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          mode?: string | null
          points_earned?: number | null
          question_id?: string
          selected_option?: string | null
          selected_options?: string[] | null
          test_session_id?: string | null
          time_spent?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      question_edit_history: {
        Row: {
          created_at: string | null
          edited_by: string | null
          id: string
          previous_answer: string | null
          previous_explanation: string | null
          previous_options: Json | null
          previous_question: string | null
          question_id: string | null
        }
        Insert: {
          created_at?: string | null
          edited_by?: string | null
          id?: string
          previous_answer?: string | null
          previous_explanation?: string | null
          previous_options?: Json | null
          previous_question?: string | null
          question_id?: string | null
        }
        Update: {
          created_at?: string | null
          edited_by?: string | null
          id?: string
          previous_answer?: string | null
          previous_explanation?: string | null
          previous_options?: Json | null
          previous_question?: string | null
          question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_edit_history_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_edit_history_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      question_reports: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          question_id: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          question_id: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          question_id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_reports_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_reports_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          batch_id: string | null
          chapter: string | null
          chapter_id: string | null
          concept_id: string | null
          content_hash: string | null
          correct_answer: string | null
          correct_option: string | null
          correct_options: string[] | null
          created_at: string | null
          difficulty: string | null
          difficulty_jee_mains:
            | Database["public"]["Enums"]["difficulty_level"]
            | null
          difficulty_neet:
            | Database["public"]["Enums"]["difficulty_level"]
            | null
          exam: string | null
          exam_relevance: Database["public"]["Enums"]["exam_code"][] | null
          explanation: string | null
          id: string
          is_active: boolean | null
          is_pyq: boolean | null
          is_verified: boolean | null
          language: string | null
          numerical_answer: number | null
          numerical_tolerance: number | null
          option_a: string | null
          option_b: string | null
          option_c: string | null
          option_d: string | null
          options: Json | null
          pyq_exam: string | null
          pyq_session: string | null
          pyq_year: number | null
          question: string | null
          question_image_url: string | null
          question_text: string | null
          question_type: string | null
          source: string | null
          source_row_id: string | null
          subject: string | null
          subject_id: string | null
          topic: string | null
          topic_id: string | null
          updated_at: string | null
          year: number | null
        }
        Insert: {
          batch_id?: string | null
          chapter?: string | null
          chapter_id?: string | null
          concept_id?: string | null
          content_hash?: string | null
          correct_answer?: string | null
          correct_option?: string | null
          correct_options?: string[] | null
          created_at?: string | null
          difficulty?: string | null
          difficulty_jee_mains?:
            | Database["public"]["Enums"]["difficulty_level"]
            | null
          difficulty_neet?:
            | Database["public"]["Enums"]["difficulty_level"]
            | null
          exam?: string | null
          exam_relevance?: Database["public"]["Enums"]["exam_code"][] | null
          explanation?: string | null
          id?: string
          is_active?: boolean | null
          is_pyq?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          numerical_answer?: number | null
          numerical_tolerance?: number | null
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          options?: Json | null
          pyq_exam?: string | null
          pyq_session?: string | null
          pyq_year?: number | null
          question?: string | null
          question_image_url?: string | null
          question_text?: string | null
          question_type?: string | null
          source?: string | null
          source_row_id?: string | null
          subject?: string | null
          subject_id?: string | null
          topic?: string | null
          topic_id?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          batch_id?: string | null
          chapter?: string | null
          chapter_id?: string | null
          concept_id?: string | null
          content_hash?: string | null
          correct_answer?: string | null
          correct_option?: string | null
          correct_options?: string[] | null
          created_at?: string | null
          difficulty?: string | null
          difficulty_jee_mains?:
            | Database["public"]["Enums"]["difficulty_level"]
            | null
          difficulty_neet?:
            | Database["public"]["Enums"]["difficulty_level"]
            | null
          exam?: string | null
          exam_relevance?: Database["public"]["Enums"]["exam_code"][] | null
          explanation?: string | null
          id?: string
          is_active?: boolean | null
          is_pyq?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          numerical_answer?: number | null
          numerical_tolerance?: number | null
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          options?: Json | null
          pyq_exam?: string | null
          pyq_session?: string | null
          pyq_year?: number | null
          question?: string | null
          question_image_url?: string | null
          question_text?: string | null
          question_type?: string | null
          source?: string | null
          source_row_id?: string | null
          subject?: string | null
          subject_id?: string | null
          topic?: string | null
          topic_id?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          referral_code: string
          referred_email: string | null
          referred_id: string | null
          referred_user_id: string | null
          referrer_id: string
          reward_granted: boolean | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          referral_code: string
          referred_email?: string | null
          referred_id?: string | null
          referred_user_id?: string | null
          referrer_id: string
          reward_granted?: boolean | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          referral_code?: string
          referred_email?: string | null
          referred_id?: string | null
          referred_user_id?: string | null
          referrer_id?: string
          reward_granted?: boolean | null
          status?: string | null
        }
        Relationships: []
      }
      study_notes: {
        Row: {
          chapter_id: string | null
          class_level: number | null
          content_md: string
          created_at: string | null
          created_by: string | null
          display_order: number | null
          exam_relevance: string[] | null
          id: string
          is_published: boolean | null
          reading_time_minutes: number | null
          subject: string | null
          title: string
          topic_id: string | null
          updated_at: string | null
        }
        Insert: {
          chapter_id?: string | null
          class_level?: number | null
          content_md?: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          exam_relevance?: string[] | null
          id?: string
          is_published?: boolean | null
          reading_time_minutes?: number | null
          subject?: string | null
          title: string
          topic_id?: string | null
          updated_at?: string | null
        }
        Update: {
          chapter_id?: string | null
          class_level?: number | null
          content_md?: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          exam_relevance?: string[] | null
          id?: string
          is_published?: boolean | null
          reading_time_minutes?: number | null
          subject?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_notes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_notes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      study_plans: {
        Row: {
          created_at: string | null
          exam_date: string | null
          goal_exam: string | null
          hours_per_day: number | null
          id: string
          plan: Json | null
          target_rank: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          exam_date?: string | null
          goal_exam?: string | null
          hours_per_day?: number | null
          id?: string
          plan?: Json | null
          target_rank?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          exam_date?: string | null
          goal_exam?: string | null
          hours_per_day?: number | null
          id?: string
          plan?: Json | null
          target_rank?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          currency: string | null
          description: string | null
          display_duration: string | null
          display_order: number | null
          duration_days: number
          features: Json | null
          id: string
          is_active: boolean | null
          is_best_value: boolean | null
          is_popular: boolean | null
          mrp_price: number | null
          name: string
          price: number
          razorpay_plan_id: string | null
          tagline: string | null
          tier: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          display_duration?: string | null
          display_order?: number | null
          duration_days: number
          features?: Json | null
          id: string
          is_active?: boolean | null
          is_best_value?: boolean | null
          is_popular?: boolean | null
          mrp_price?: number | null
          name: string
          price: number
          razorpay_plan_id?: string | null
          tagline?: string | null
          tier?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          display_duration?: string | null
          display_order?: number | null
          duration_days?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_best_value?: boolean | null
          is_popular?: boolean | null
          mrp_price?: number | null
          name?: string
          price?: number
          razorpay_plan_id?: string | null
          tagline?: string | null
          tier?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      test_attempt_violations: {
        Row: {
          auto_submitted: boolean
          created_at: string
          id: string
          mode: string
          occurred_at: string
          test_session_id: string | null
          user_id: string
          violation_count: number
          violation_type: string
        }
        Insert: {
          auto_submitted?: boolean
          created_at?: string
          id?: string
          mode: string
          occurred_at?: string
          test_session_id?: string | null
          user_id: string
          violation_count?: number
          violation_type: string
        }
        Update: {
          auto_submitted?: boolean
          created_at?: string
          id?: string
          mode?: string
          occurred_at?: string
          test_session_id?: string | null
          user_id?: string
          violation_count?: number
          violation_type?: string
        }
        Relationships: []
      }
      test_sessions: {
        Row: {
          accuracy: number | null
          answers: Json | null
          attempted_questions: number | null
          batch_id: string | null
          completed_at: string | null
          correct_answers: number | null
          created_at: string | null
          group_test_id: string | null
          id: string
          question_ids: Json | null
          score: number | null
          started_at: string | null
          status: string | null
          subject: string | null
          test_type: string | null
          time_limit: number | null
          time_taken: number | null
          title: string | null
          total_questions: number | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          answers?: Json | null
          attempted_questions?: number | null
          batch_id?: string | null
          completed_at?: string | null
          correct_answers?: number | null
          created_at?: string | null
          group_test_id?: string | null
          id?: string
          question_ids?: Json | null
          score?: number | null
          started_at?: string | null
          status?: string | null
          subject?: string | null
          test_type?: string | null
          time_limit?: number | null
          time_taken?: number | null
          title?: string | null
          total_questions?: number | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          answers?: Json | null
          attempted_questions?: number | null
          batch_id?: string | null
          completed_at?: string | null
          correct_answers?: number | null
          created_at?: string | null
          group_test_id?: string | null
          id?: string
          question_ids?: Json | null
          score?: number | null
          started_at?: string | null
          status?: string | null
          subject?: string | null
          test_type?: string | null
          time_limit?: number | null
          time_taken?: number | null
          title?: string | null
          total_questions?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_sessions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_mastery: {
        Row: {
          accuracy: number | null
          id: string
          last_attempted: string | null
          mastery_level: number | null
          questions_attempted: number | null
          questions_correct: number | null
          topic_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          id?: string
          last_attempted?: string | null
          mastery_level?: number | null
          questions_attempted?: number | null
          questions_correct?: number | null
          topic_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          id?: string
          last_attempted?: string | null
          mastery_level?: number | null
          questions_attempted?: number | null
          questions_correct?: number | null
          topic_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_mastery_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          chapter_id: string | null
          created_at: string | null
          description: string | null
          difficulty_level: string | null
          display_order: number | null
          estimated_hours: number | null
          estimated_time: number | null
          id: string
          is_active: boolean | null
          is_free: boolean | null
          name: string | null
          slug: string | null
          topic_name: string | null
          topic_number: number | null
          updated_at: string | null
        }
        Insert: {
          chapter_id?: string | null
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          display_order?: number | null
          estimated_hours?: number | null
          estimated_time?: number | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name?: string | null
          slug?: string | null
          topic_name?: string | null
          topic_number?: number | null
          updated_at?: string | null
        }
        Update: {
          chapter_id?: string | null
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          display_order?: number | null
          estimated_hours?: number | null
          estimated_time?: number | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name?: string | null
          slug?: string | null
          topic_name?: string | null
          topic_number?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topics_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_batch_subscriptions: {
        Row: {
          batch_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          payment_id: string | null
          starts_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          payment_id?: string | null
          starts_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          payment_id?: string | null
          starts_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_batch_subscriptions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string | null
          notification_id: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string | null
          notification_id?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string | null
          notification_id?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      my_profile: {
        Row: {
          avatar_url: string | null
          badges: Json | null
          city: string | null
          created_at: string | null
          current_streak: number | null
          daily_goal: number | null
          daily_question_limit: number | null
          educator_approved: boolean | null
          email: string | null
          full_name: string | null
          goal_exam: string | null
          goal_locked: boolean | null
          goal_locked_at: string | null
          grade: number | null
          id: string | null
          is_premium: boolean | null
          last_activity: string | null
          last_activity_date: string | null
          last_streak_date: string | null
          level: string | null
          level_progress: number | null
          longest_streak: number | null
          onboarding_completed: boolean | null
          overall_accuracy: number | null
          phone: string | null
          questions_today: number | null
          referral_code: string | null
          smart_goal_enabled: boolean | null
          state: string | null
          streak_freeze_available: boolean | null
          subjects: string[] | null
          subscription_end_date: string | null
          subscription_plan: string | null
          subscription_status: string | null
          subscription_tier: string | null
          target_exam: string | null
          target_exam_date: string | null
          target_rank: number | null
          total_points: number | null
          total_questions_solved: number | null
          total_study_time: number | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          badges?: Json | null
          city?: string | null
          created_at?: string | null
          current_streak?: number | null
          daily_goal?: number | null
          daily_question_limit?: number | null
          educator_approved?: boolean | null
          email?: string | null
          full_name?: string | null
          goal_exam?: string | null
          goal_locked?: boolean | null
          goal_locked_at?: string | null
          grade?: number | null
          id?: string | null
          is_premium?: boolean | null
          last_activity?: string | null
          last_activity_date?: string | null
          last_streak_date?: string | null
          level?: string | null
          level_progress?: number | null
          longest_streak?: number | null
          onboarding_completed?: boolean | null
          overall_accuracy?: number | null
          phone?: string | null
          questions_today?: number | null
          referral_code?: string | null
          smart_goal_enabled?: boolean | null
          state?: string | null
          streak_freeze_available?: boolean | null
          subjects?: string[] | null
          subscription_end_date?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          target_exam?: string | null
          target_exam_date?: string | null
          target_rank?: number | null
          total_points?: number | null
          total_questions_solved?: number | null
          total_study_time?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          badges?: Json | null
          city?: string | null
          created_at?: string | null
          current_streak?: number | null
          daily_goal?: number | null
          daily_question_limit?: number | null
          educator_approved?: boolean | null
          email?: string | null
          full_name?: string | null
          goal_exam?: string | null
          goal_locked?: boolean | null
          goal_locked_at?: string | null
          grade?: number | null
          id?: string | null
          is_premium?: boolean | null
          last_activity?: string | null
          last_activity_date?: string | null
          last_streak_date?: string | null
          level?: string | null
          level_progress?: number | null
          longest_streak?: number | null
          onboarding_completed?: boolean | null
          overall_accuracy?: number | null
          phone?: string | null
          questions_today?: number | null
          referral_code?: string | null
          smart_goal_enabled?: boolean | null
          state?: string | null
          streak_freeze_available?: boolean | null
          subjects?: string[] | null
          subscription_end_date?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          target_exam?: string | null
          target_exam_date?: string | null
          target_rank?: number | null
          total_points?: number | null
          total_questions_solved?: number | null
          total_study_time?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      questions_public: {
        Row: {
          chapter: string | null
          chapter_id: string | null
          created_at: string | null
          difficulty: string | null
          exam: string | null
          exam_relevance: Database["public"]["Enums"]["exam_code"][] | null
          id: string | null
          is_active: boolean | null
          is_pyq: boolean | null
          is_verified: boolean | null
          option_a: string | null
          option_b: string | null
          option_c: string | null
          option_d: string | null
          options: Json | null
          pyq_year: number | null
          question: string | null
          question_image_url: string | null
          question_text: string | null
          question_type: string | null
          subject: string | null
          subject_id: string | null
          topic: string | null
          topic_id: string | null
          updated_at: string | null
          year: number | null
        }
        Insert: {
          chapter?: string | null
          chapter_id?: string | null
          created_at?: string | null
          difficulty?: string | null
          exam?: string | null
          exam_relevance?: Database["public"]["Enums"]["exam_code"][] | null
          id?: string | null
          is_active?: boolean | null
          is_pyq?: boolean | null
          is_verified?: boolean | null
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          options?: Json | null
          pyq_year?: number | null
          question?: string | null
          question_image_url?: string | null
          question_text?: string | null
          question_type?: string | null
          subject?: string | null
          subject_id?: string | null
          topic?: string | null
          topic_id?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          chapter?: string | null
          chapter_id?: string | null
          created_at?: string | null
          difficulty?: string | null
          exam?: string | null
          exam_relevance?: Database["public"]["Enums"]["exam_code"][] | null
          id?: string | null
          is_active?: boolean | null
          is_pyq?: boolean | null
          is_verified?: boolean | null
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          options?: Json | null
          pyq_year?: number | null
          question?: string | null
          question_image_url?: string | null
          question_text?: string | null
          question_type?: string | null
          subject?: string | null
          subject_id?: string | null
          topic?: string | null
          topic_id?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals_safe: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string | null
          referral_code: string | null
          referred_user_id: string | null
          referrer_id: string | null
          reward_granted: boolean | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string | null
          referral_code?: string | null
          referred_user_id?: string | null
          referrer_id?: string | null
          reward_granted?: boolean | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string | null
          referral_code?: string | null
          referred_user_id?: string | null
          referrer_id?: string | null
          reward_granted?: boolean | null
          status?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_get_profiles_by_ids: {
        Args: { p_user_ids: string[] }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      admin_list_profiles: {
        Args: never
        Returns: {
          created_at: string
          educator_approved: boolean
          email: string
          full_name: string
          grade: number
          id: string
          is_premium: boolean
          phone: string
          subscription_end_date: string
          subscription_plan: string
          subscription_status: string
          subscription_tier: string
          target_exam: string
        }[]
      }
      apply_paid_subscription: {
        Args: {
          p_end_date: string
          p_plan_id: string
          p_razorpay_order_id: string
          p_razorpay_payment_id: string
          p_razorpay_signature: string
          p_tier: string
          p_user_id: string
        }
        Returns: undefined
      }
      award_badge: {
        Args: { _badge_id: string; _user_id: string }
        Returns: string
      }
      cancel_subscription: { Args: never; Returns: Json }
      change_user_goal: {
        Args: {
          p_confirm_reset?: boolean
          p_new_goal: string
          p_new_grade: number
          p_new_target_exam: string
          p_user_id: string
        }
        Returns: Json
      }
      check_and_reset_streak: { Args: { p_user_id: string }; Returns: Json }
      classify_questions_batch: {
        Args: { p_batch_size?: number }
        Returns: Json
      }
      cleanup_expired_subscriptions: { Args: never; Returns: undefined }
      create_referral: { Args: { p_referral_code: string }; Returns: Json }
      delete_duplicate_questions: { Args: never; Returns: Json }
      ensure_daily_progress: {
        Args: { p_daily_target?: number; p_user_id: string }
        Returns: Json
      }
      ensure_policy: {
        Args: { p_cmd: string; p_name: string; p_table: string }
        Returns: undefined
      }
      finish_battle: { Args: { p_battle_id: string }; Returns: Json }
      fix_chapter_batch_distribution: { Args: never; Returns: Json }
      fn_expire_batch_subscriptions: { Args: never; Returns: undefined }
      get_chapter_difficulty_distribution: {
        Args: { p_chapter_id: string }
        Returns: {
          count: number
          difficulty: string
        }[]
      }
      get_chapter_question_counts:
        | {
            Args: { p_chapter_ids: string[]; p_exam?: string }
            Returns: {
              chapter_id: string
              count: number
            }[]
          }
        | {
            Args: { p_batch_ids?: string[]; p_exam?: string; p_subject: string }
            Returns: {
              chapter_id: string
              count: number
            }[]
          }
      get_leaderboard_with_stats: {
        Args: { limit_count?: number }
        Returns: {
          accuracy: number
          avatar_url: string
          current_streak: number
          full_name: string
          id: string
          total_points: number
          total_questions: number
        }[]
      }
      get_questions_for_remap: {
        Args: { batch_size?: number }
        Returns: {
          chapter_id: string
          id: string
          question_text: string
          subject: string
        }[]
      }
      get_subject_question_counts: {
        Args: { p_batch_ids?: string[]; p_exam?: string }
        Returns: {
          count: number
          subject: string
        }[]
      }
      get_topic_question_counts:
        | {
            Args: { p_chapter_id: string }
            Returns: {
              count: number
              topic_id: string
            }[]
          }
        | {
            Args: {
              p_batch_ids?: string[]
              p_chapter_id: string
              p_exam?: string
            }
            Returns: {
              count: number
              topic_id: string
            }[]
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_promo_redemption: {
        Args: { p_promo_id: string }
        Returns: undefined
      }
      is_active_pro_plus: { Args: { p_user_id: string }; Returns: boolean }
      log_points:
        | {
            Args: {
              p_action_type: string
              p_description?: string
              p_points: number
              p_reference_id?: string
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_action_type: string
              p_description?: string
              p_points: number
              p_reference_id?: string
              p_user_id: string
            }
            Returns: string
          }
      reset_user_progress: { Args: { p_user_id: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_battle: {
        Args: {
          p_chapter?: string
          p_difficulty?: string
          p_subject?: string
          p_topic_id?: string
        }
        Returns: Json
      }
      submit_battle_answer: {
        Args: {
          p_battle_id: string
          p_numerical_answer?: number
          p_question_id: string
          p_selected_options?: string[]
        }
        Returns: Json
      }
      sync_daily_progress: {
        Args: {
          p_is_correct: boolean
          p_points_delta: number
          p_user_id: string
        }
        Returns: Json
      }
      update_daily_accuracy: {
        Args: { p_accuracy: number; p_user_id: string }
        Returns: Json
      }
      update_own_profile: {
        Args: {
          p_avatar_url?: string
          p_city?: string
          p_daily_goal?: number
          p_full_name?: string
          p_grade?: number
          p_phone?: string
          p_smart_goal_enabled?: boolean
          p_state?: string
          p_subjects?: string[]
          p_target_exam?: string
          p_target_exam_date?: string
        }
        Returns: undefined
      }
      update_practice_stats: {
        Args: {
          p_is_correct: boolean
          p_points_delta: number
          p_user_id: string
        }
        Returns: Json
      }
      update_streak_stats: { Args: { p_user_id: string }; Returns: Json }
      upsert_topic_mastery: {
        Args: { p_is_correct: boolean; p_topic_id: string; p_user_id: string }
        Returns: Json
      }
      validate_practice_answer: {
        Args: {
          p_numerical_answer?: number
          p_question_id: string
          p_selected_options?: string[]
        }
        Returns: Json
      }
      validate_promo_code: {
        Args: { p_code: string; p_plan_id: string; p_user_id: string }
        Returns: Json
      }
      validate_question_answer:
        | {
            Args: { p_question_id: string; p_selected_option: string }
            Returns: Json
          }
        | {
            Args: {
              p_exam?: Database["public"]["Enums"]["exam_code"]
              p_numerical_answer?: number
              p_question_id: string
              p_selected_options?: string[]
            }
            Returns: Json
          }
    }
    Enums: {
      app_role: "admin" | "super_admin" | "student" | "educator"
      bloom_level_enum:
        | "REMEMBER"
        | "UNDERSTAND"
        | "APPLY"
        | "ANALYZE"
        | "EVALUATE"
        | "CREATE"
      difficulty_level: "EASY" | "MEDIUM" | "HARD"
      exam_code: "JEE_MAINS" | "JEE_ADVANCED" | "NEET"
      question_style_enum:
        | "numerical"
        | "conceptual"
        | "formula_based"
        | "application"
        | "theory"
      question_type_enum:
        | "single_correct"
        | "multi_correct"
        | "numerical_int"
        | "numerical_decimal"
        | "assertion_reason"
        | "matrix_match"
        | "comprehension"
      staging_status:
        | "pending"
        | "validated"
        | "needs_review"
        | "approved"
        | "rejected"
        | "promoted"
      subject_code: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS" | "BIOLOGY"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "super_admin", "student", "educator"],
      bloom_level_enum: [
        "REMEMBER",
        "UNDERSTAND",
        "APPLY",
        "ANALYZE",
        "EVALUATE",
        "CREATE",
      ],
      difficulty_level: ["EASY", "MEDIUM", "HARD"],
      exam_code: ["JEE_MAINS", "JEE_ADVANCED", "NEET"],
      question_style_enum: [
        "numerical",
        "conceptual",
        "formula_based",
        "application",
        "theory",
      ],
      question_type_enum: [
        "single_correct",
        "multi_correct",
        "numerical_int",
        "numerical_decimal",
        "assertion_reason",
        "matrix_match",
        "comprehension",
      ],
      staging_status: [
        "pending",
        "validated",
        "needs_review",
        "approved",
        "rejected",
        "promoted",
      ],
      subject_code: ["PHYSICS", "CHEMISTRY", "MATHEMATICS", "BIOLOGY"],
    },
  },
} as const
