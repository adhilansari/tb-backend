import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CreateMessageDto, StartConversationDto } from './dto/create-message.dto';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) { }

  @Get('conversations')
  @ApiOperation({ summary: 'Get all conversations for current user' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Returns paginated list of conversations' })
  async getUserConversations(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.messagesService.getUserConversations(req.user.id, page, limit);
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Start a new conversation' })
  @ApiResponse({ status: 201, description: 'Conversation created and message sent' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async startConversation(
    @Request() req: any,
    @Body() startConversationDto: StartConversationDto,
  ) {
    // Get or create conversation
    const conversation = await this.messagesService.getOrCreateConversation(
      req.user.id,
      startConversationDto.receiverId,
    );

    // Send initial message
    const message = await this.messagesService.sendMessage(
      conversation.id,
      req.user.id,
      { content: startConversationDto.message },
    );

    return {
      conversation,
      message,
    };
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get specific conversation details' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Returns conversation details' })
  @ApiResponse({ status: 403, description: 'Not a participant' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getConversation(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.messagesService.getConversation(id, req.user.id);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete a conversation and all its messages' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Conversation deleted' })
  @ApiResponse({ status: 403, description: 'Not a participant' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async deleteConversation(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.messagesService.deleteConversation(id, req.user.id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({ status: 200, description: 'Returns paginated list of messages' })
  @ApiResponse({ status: 403, description: 'Not a participant' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getMessages(
    @Request() req: any,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.messagesService.getMessages(id, req.user.id, page, limit);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message in a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @ApiResponse({ status: 403, description: 'Not a participant' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async sendMessage(
    @Request() req: any,
    @Param('id') id: string,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    return this.messagesService.sendMessage(id, req.user.id, createMessageDto);
  }

  @Patch('conversations/:id/read')
  @ApiOperation({ summary: 'Mark all messages in conversation as read' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  @ApiResponse({ status: 403, description: 'Not a participant' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async markAsRead(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.messagesService.markMessagesAsRead(id, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a message' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiQuery({
    name: 'deleteFor',
    required: false,
    enum: ['sender', 'receiver', 'both'],
    description: 'Delete for sender, receiver, or both',
    example: 'sender',
  })
  @ApiResponse({ status: 200, description: 'Message deleted' })
  @ApiResponse({ status: 403, description: 'Cannot delete this message' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteMessage(
    @Request() req: any,
    @Param('id') id: string,
    @Query('deleteFor') deleteFor: 'sender' | 'receiver' | 'both' = 'sender',
  ) {
    return this.messagesService.deleteMessage(id, req.user.id, deleteFor);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread message count for current user' })
  @ApiResponse({ status: 200, description: 'Returns total unread count' })
  async getUnreadCount(@Request() req: any) {
    const count = await this.messagesService.getUnreadCount(req.user.id);
    return { count };
  }

  @Get('conversations/:id/unread-count')
  @ApiOperation({ summary: 'Get unread count for specific conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Returns conversation unread count' })
  async getConversationUnreadCount(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const count = await this.messagesService.getConversationUnreadCount(id, req.user.id);
    return { count };
  }
}
