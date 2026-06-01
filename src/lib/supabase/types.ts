export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      card_reviews: {
        Row: {
          clerk_user_id: string
          correct: boolean
          flashcard_id: string
          id: string
          rating: string
          reviewed_at: string
          time_ms: number
        }
        Insert: {
          clerk_user_id: string
          correct: boolean
          flashcard_id: string
          id?: string
          rating: string
          reviewed_at?: string
          time_ms?: number
        }
        Update: {
          clerk_user_id?: string
          correct?: boolean
          flashcard_id?: string
          id?: string
          rating?: string
          reviewed_at?: string
          time_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "card_reviews_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_messages: {
        Row: {
          clerk_user_id: string
          content: string
          created_at: string
          game_id: string
          id: string
          move_number: number | null
          role: string
        }
        Insert: {
          clerk_user_id: string
          content: string
          created_at?: string
          game_id: string
          id?: string
          move_number?: number | null
          role: string
        }
        Update: {
          clerk_user_id?: string
          content?: string
          created_at?: string
          game_id?: string
          id?: string
          move_number?: number | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_accounts: {
        Row: {
          clerk_user_id: string
          created_at: string
          id: string
          last_sync_at: string | null
          provider: string
          updated_at: string
          username: string
        }
        Insert: {
          clerk_user_id: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          provider: string
          updated_at?: string
          username: string
        }
        Update: {
          clerk_user_id?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          provider?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      daily_activity: {
        Row: {
          activity_date: string
          cards_correct: number
          cards_mastered: number
          cards_reviewed: number
          clerk_user_id: string
          drill_time_ms: number
          games_analyzed: number
          games_reviewed: number
          updated_at: string
        }
        Insert: {
          activity_date: string
          cards_correct?: number
          cards_mastered?: number
          cards_reviewed?: number
          clerk_user_id: string
          drill_time_ms?: number
          games_analyzed?: number
          games_reviewed?: number
          updated_at?: string
        }
        Update: {
          activity_date?: string
          cards_correct?: number
          cards_mastered?: number
          cards_reviewed?: number
          clerk_user_id?: string
          drill_time_ms?: number
          games_analyzed?: number
          games_reviewed?: number
          updated_at?: string
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          best_move: string
          clerk_user_id: string
          created_at: string
          ease_factor: number
          evaluation: string
          explanation: string
          fen: string
          game_id: string
          id: string
          interval: number
          mistake_type: string
          move_number: number
          next_review: string
          opponent: string
          status: string
          time_remaining: string | null
          updated_at: string
          your_move: string
        }
        Insert: {
          best_move: string
          clerk_user_id: string
          created_at?: string
          ease_factor?: number
          evaluation: string
          explanation: string
          fen: string
          game_id: string
          id: string
          interval?: number
          mistake_type: string
          move_number: number
          next_review?: string
          opponent: string
          status?: string
          time_remaining?: string | null
          updated_at?: string
          your_move: string
        }
        Update: {
          best_move?: string
          clerk_user_id?: string
          created_at?: string
          ease_factor?: number
          evaluation?: string
          explanation?: string
          fen?: string
          game_id?: string
          id?: string
          interval?: number
          mistake_type?: string
          move_number?: number
          next_review?: string
          opponent?: string
          status?: string
          time_remaining?: string | null
          updated_at?: string
          your_move?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_analyses: {
        Row: {
          analyzed_at: string
          black_accuracy: number
          blunders: number
          brilliancies: number
          clerk_user_id: string
          depth: number
          game_id: string
          greats: number
          id: string
          inaccuracies: number
          missed_wins: number
          mistakes: number
          moves: Json
          start_eval: number
          white_accuracy: number
        }
        Insert: {
          analyzed_at?: string
          black_accuracy?: number
          blunders?: number
          brilliancies?: number
          clerk_user_id: string
          depth: number
          game_id: string
          greats?: number
          id?: string
          inaccuracies?: number
          missed_wins?: number
          mistakes?: number
          moves?: Json
          start_eval?: number
          white_accuracy?: number
        }
        Update: {
          analyzed_at?: string
          black_accuracy?: number
          blunders?: number
          brilliancies?: number
          clerk_user_id?: string
          depth?: number
          game_id?: string
          greats?: number
          id?: string
          inaccuracies?: number
          missed_wins?: number
          mistakes?: number
          moves?: Json
          start_eval?: number
          white_accuracy?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_analyses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          blunders: number
          clerk_user_id: string
          created_at: string
          id: string
          inaccuracies: number
          mistakes: number
          mistakes_fixed: number
          opponent: string
          opponent_rating: number
          opponent_time_left: string | null
          pgn: string
          played_at: string
          player_color: string
          player_rating: number
          player_time_left: string | null
          result: string
          review_status: string
          source: string
          source_game_id: string | null
          time_control: string
          total_mistakes: number
          updated_at: string
        }
        Insert: {
          blunders?: number
          clerk_user_id: string
          created_at?: string
          id: string
          inaccuracies?: number
          mistakes?: number
          mistakes_fixed?: number
          opponent: string
          opponent_rating?: number
          opponent_time_left?: string | null
          pgn?: string
          played_at: string
          player_color: string
          player_rating?: number
          player_time_left?: string | null
          result: string
          review_status?: string
          source: string
          source_game_id?: string | null
          time_control: string
          total_mistakes?: number
          updated_at?: string
        }
        Update: {
          blunders?: number
          clerk_user_id?: string
          created_at?: string
          id?: string
          inaccuracies?: number
          mistakes?: number
          mistakes_fixed?: number
          opponent?: string
          opponent_rating?: number
          opponent_time_left?: string | null
          pgn?: string
          played_at?: string
          player_color?: string
          player_rating?: number
          player_time_left?: string | null
          result?: string
          review_status?: string
          source?: string
          source_game_id?: string | null
          time_control?: string
          total_mistakes?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          clerk_user_id: string
          created_at: string
          display_name: string | null
          email: string | null
          updated_at: string
        }
        Insert: {
          clerk_user_id: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          updated_at?: string
        }
        Update: {
          clerk_user_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          clerk_user_id: string
          fix_opponent_mistakes: boolean
          preferences: Json
          updated_at: string
        }
        Insert: {
          clerk_user_id: string
          fix_opponent_mistakes?: boolean
          preferences?: Json
          updated_at?: string
        }
        Update: {
          clerk_user_id?: string
          fix_opponent_mistakes?: boolean
          preferences?: Json
          updated_at?: string
        }
        Relationships: []
      }
      user_streak: {
        Row: {
          best_streak: number
          clerk_user_id: string
          current_streak: number
          last_active_date: string | null
          today_drill_count: number
          today_drill_date: string | null
          today_review_date: string | null
          today_reviewed_game: boolean
          updated_at: string
        }
        Insert: {
          best_streak?: number
          clerk_user_id: string
          current_streak?: number
          last_active_date?: string | null
          today_drill_count?: number
          today_drill_date?: string | null
          today_review_date?: string | null
          today_reviewed_game?: boolean
          updated_at?: string
        }
        Update: {
          best_streak?: number
          clerk_user_id?: string
          current_streak?: number
          last_active_date?: string | null
          today_drill_count?: number
          today_drill_date?: string | null
          today_review_date?: string | null
          today_reviewed_game?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clerk_user_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
